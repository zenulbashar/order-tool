import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";

import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
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
        await db
          .update(orders)
          .set({ status: "confirmed" })
          .where(
            and(
              eq(orders.stripePaymentIntentId, paymentIntent.id),
              eq(orders.status, "pending_payment"),
            ),
          );
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
