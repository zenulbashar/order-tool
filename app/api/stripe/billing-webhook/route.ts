import type Stripe from "stripe";

import {
  resolveVenueId,
  setVenuePlanStatus,
  syncVenueFromSubscription,
} from "@/lib/billing/sync";
import { getStripe } from "@/lib/stripe";

// Stripe signature verification uses Node crypto, and the Neon pool needs Node —
// keep this handler off the Edge runtime.
export const runtime = "nodejs";

/**
 * Stripe BILLING webhook (Phase 2) — the platform-subscription event sink.
 *
 * This endpoint is COMPLETELY SEPARATE from the order webhook
 * (app/api/stripe/webhook/route.ts). It has its OWN signing secret
 * (STRIPE_BILLING_WEBHOOK_SECRET), handles ONLY subscription / invoice /
 * checkout events, and shares NO code or state with the order webhook. It does
 * NOT handle payment_intent events — those belong solely to the order webhook
 * and the diner money path, which this file never touches.
 *
 * Hostile public surface, same discipline as the order webhook:
 *  - the RAW body is verified against STRIPE_BILLING_WEBHOOK_SECRET on EVERY
 *    request; an unverified / invalid-signature request is rejected with 400;
 *  - if the secret is absent we fail safe and reject — never bypass verification;
 *  - the venue is resolved from metadata we stamp (venueId) or the stored
 *    customer/subscription ids, never from an unauthenticated client value;
 *  - handling is idempotent: every handler derives state and SETs it (never
 *    increments), so Stripe's retries / duplicate / out-of-order deliveries
 *    converge to the same venue row.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.STRIPE_BILLING_WEBHOOK_SECRET;
  if (!secret) {
    return new Response("Billing webhook secret is not configured.", {
      status: 400,
    });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing signature.", { status: 400 });
  }

  // RAW body — read exactly as received and NEVER parse before verifying.
  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(payload, signature, secret);
  } catch {
    return new Response("Invalid signature.", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        // The owner finished hosted Checkout. Link the subscription to the venue
        // and sync from the authoritative subscription object.
        const session = event.data.object;
        if (session.mode !== "subscription") break;
        const subscriptionId = stripeId(session.subscription);
        const venueId = await resolveVenueId({
          metadataVenueId: session.metadata?.venueId,
          subscriptionId,
          customerId: stripeId(session.customer),
        });
        if (!venueId || !subscriptionId) break;
        const subscription =
          await getStripe().subscriptions.retrieve(subscriptionId);
        await syncVenueFromSubscription(venueId, subscription);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        // The subscription object IS the current truth (status, price, trial_end)
        // — sync directly. `deleted` arrives with status `canceled`, which the
        // sync maps to the `free` baseline.
        const subscription = event.data.object;
        const venueId = await resolveVenueId({
          metadataVenueId: subscription.metadata?.venueId,
          subscriptionId: subscription.id,
          customerId: stripeId(subscription.customer),
        });
        if (!venueId) break;
        await syncVenueFromSubscription(venueId, subscription);
        break;
      }

      case "invoice.paid": {
        // A successful charge (incl. trial-conversion + renewals). Re-sync from
        // the subscription so plan_status lands on `active`.
        const invoice = event.data.object;
        const subscriptionId = stripeId(
          invoice.parent?.subscription_details?.subscription,
        );
        const venueId = await resolveVenueId({
          subscriptionId,
          customerId: stripeId(invoice.customer),
        });
        if (!venueId || !subscriptionId) break;
        const subscription =
          await getStripe().subscriptions.retrieve(subscriptionId);
        await syncVenueFromSubscription(venueId, subscription);
        break;
      }

      case "invoice.payment_failed": {
        // Mark past_due but KEEP the tier — Stripe retries, and a single failed
        // renewal must not take a storefront dark mid-service. Downgrade happens
        // only when the subscription itself lapses (subscription.deleted/unpaid).
        const invoice = event.data.object;
        const venueId = await resolveVenueId({
          subscriptionId: stripeId(
            invoice.parent?.subscription_details?.subscription,
          ),
          customerId: stripeId(invoice.customer),
        });
        if (!venueId) break;
        await setVenuePlanStatus(venueId, "past_due");
        break;
      }

      default:
        // Acknowledge unrelated event types so Stripe stops resending them.
        break;
    }
  } catch {
    // Persisting failed — return 500 so Stripe retries the delivery later.
    return new Response("Handler error.", { status: 500 });
  }

  return new Response("ok", { status: 200 });
}

/** Unwrap a Stripe id | expanded object | null/undefined into a plain id. */
function stripeId(
  ref: string | { id: string } | null | undefined,
): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}
