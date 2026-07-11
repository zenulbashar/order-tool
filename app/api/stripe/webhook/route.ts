import { after } from "next/server";

import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";

import { notifyCustomerOrder } from "@/lib/customer/notify";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { enqueueJobsForOrder, processDueJobs } from "@/lib/integrations/dispatch";
import { notifyNewOrder } from "@/lib/push";
import { depleteStockForOrder } from "@/lib/stock/depletion";
import { getStripe } from "@/lib/stripe";

// Stripe signature verification uses Node crypto, and the Neon pool needs Node —
// keep this handler off the Edge runtime.
export const runtime = "nodejs";

/**
 * Stripe webhook — the ONLY path that confirms or fails an order. Treated as a
 * hostile public surface:
 *  - the RAW request body is verified against STRIPE_WEBHOOK_SECRET on EVERY
 *    request; an unverified / invalid-signature request is rejected with 400 and
 *    does nothing (an unverified webhook would be a spoofable
 *    "mark my order paid" endpoint — verification is non-negotiable);
 *  - if the secret is absent we fail safe and reject — never bypass verification;
 *  - orders are resolved ONLY by stripe_payment_intent_id, never a client value;
 *  - handling is idempotent: the `status = 'pending_payment'` guard makes
 *    Stripe's retries / duplicate deliveries a no-op and only the expected prior
 *    state ever transitions.
 *
 * For Connect direct charges these arrive at the platform's CONNECT webhook
 * endpoint (with event.account set); the platform signing secret verifies them,
 * and the globally-unique PaymentIntent id is sufficient to resolve the order.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return new Response("Webhook secret is not configured.", { status: 400 });
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
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object;
        // `.returning()` captures the ACTUAL transition: the WHERE only matches a
        // still-pending order, so a retried webhook (already confirmed) returns
        // zero rows — used below to fire the customer notification exactly once.
        const confirmed = await db
          .update(orders)
          .set({ status: "confirmed" })
          .where(
            and(
              eq(orders.stripePaymentIntentId, paymentIntent.id),
              eq(orders.status, "pending_payment"),
            ),
          )
          .returning({ id: orders.id });
        // ADDITIVE (Track 0) — the SINGLE integrations touch in this handler.
        // Runs strictly AFTER the confirm UPDATE above (which is unchanged),
        // and its try/catch swallows EVERYTHING: an integrations failure can
        // never turn this response into a 500 or delay confirmation. It is a
        // latency optimization only — the cron sweep re-derives any missing
        // job from order state, so even deleting this block loses nothing.
        try {
          const enqueued = await enqueueJobsForOrder(paymentIntent.id);
          if (enqueued > 0) {
            // Kick processing after the response is sent (Vercel waitUntil).
            after(() => processDueJobs(enqueued).catch(() => {}));
          }
        } catch {
          // Swallowed by design — the sweep is the guarantee.
        }
        // ADDITIVE (Track D · D4b) — stock depletion, a SECOND independent
        // integrations-style touch, held to the SAME contract as the block
        // above: it runs strictly AFTER the confirm UPDATE (unchanged), is
        // fully isolated in its own try/catch, and does all its work in after()
        // so it can never delay or fail this response. It is a latency
        // optimization only — sweepStockDepletion() (cron) re-derives any
        // missed depletion from order state, so even deleting this block loses
        // nothing. A stock failure and an integrations failure are independent.
        try {
          after(() => depleteStockForOrder(paymentIntent.id).catch(() => {}));
        } catch {
          // Swallowed by design — the sweep is the guarantee.
        }
        // ADDITIVE (native app) — new-order push, a THIRD independent, fully-
        // swallowed touch held to the SAME contract: it runs strictly AFTER the
        // confirm UPDATE (unchanged), is isolated in its own try/catch, and does
        // all its work in after() so it can never delay or fail this response.
        // notifyNewOrder is a complete no-op when FCM is not configured, so this
        // is safe on the money path; losing this block loses only the push.
        try {
          after(() => notifyNewOrder(paymentIntent.id).catch(() => {}));
        } catch {
          // Swallowed by design.
        }
        // ADDITIVE (customer notifications) — order-confirmed email/SMS to the
        // LINKED customer per their opt-in. Same best-effort contract as the
        // blocks above: gated on the ACTUAL transition (confirmed.length, so a
        // retried webhook never double-sends), isolated, and done in after() so
        // it can never delay or fail this response. No-op for guest orders and
        // when Resend / Twilio are unconfigured.
        if (confirmed.length > 0) {
          const confirmedId = confirmed[0].id;
          try {
            after(() =>
              notifyCustomerOrder(confirmedId, "confirmed").catch(() => {}),
            );
          } catch {
            // Swallowed by design.
          }
        }
        break;
      }
      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object;
        await db
          .update(orders)
          .set({ status: "payment_failed" })
          .where(
            and(
              eq(orders.stripePaymentIntentId, paymentIntent.id),
              eq(orders.status, "pending_payment"),
            ),
          );
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
