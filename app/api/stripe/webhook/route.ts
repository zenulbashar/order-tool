import { after } from "next/server";

import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";

import { notifyCustomerOrder } from "@/lib/customer/notify";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { enqueueJobsForOrder, processDueJobs } from "@/lib/integrations/dispatch";
import { drainDueJobs } from "@/lib/integrations/drain";
import { redeemGiftCardForOrder } from "@/lib/giftcards/redeem";
import { earnPointsForOrder } from "@/lib/loyalty/earn";
import { redeemPointsForOrder } from "@/lib/loyalty/redeem";
import { reportChargeAmountMismatch, reportError } from "@/lib/observability";
import { reconcileRefundsForPaymentIntent } from "@/lib/payments/refund-service";
import { notifyNewOrder } from "@/lib/push";
import { depleteStockForOrder } from "@/lib/stock/depletion";
import { getStripe } from "@/lib/stripe";

// Stripe signature verification uses Node crypto, and the Neon pool needs Node —
// keep this handler off the Edge runtime.
export const runtime = "nodejs";

/**
 * The post-response integrations kick (M2): drain due jobs in small batches
 * on a tight budget, entirely inside after(). Every confirmed order becomes
 * an opportunistic processing tick, so on any active venue a failed job's
 * 60s/5m backoff is honoured at roughly order cadence instead of waiting for
 * the next cron run. Small on purpose — this runs post-response but still
 * inside the function's execution window; the cron route is where big
 * backlogs drain.
 */
const KICK_BATCH_SIZE = 10;
const KICK_DRAIN_BUDGET_MS = 8_000;

/**
 * Log-and-swallow for the best-effort side effects below. The swallow itself is
 * load-bearing (a side-effect failure must never fail or delay the money path —
 * the cron sweep is the guarantee), but with a DAILY sweep a silent drop means
 * up to a day of invisible divergence. Since M1 the drop is reported to the
 * error tracker as well as the function log; the reporter never throws and
 * no-ops without a DSN. Async so the after()/catch chains it terminates keep
 * the invocation alive until the report is flushed.
 */
/**
 * A refund event carries either a Charge or a Refund object depending on the
 * event type; both expose `payment_intent` as an id or an expanded object.
 * Read it defensively — an unrecognised shape simply means nothing to
 * reconcile, never a thrown handler.
 */
function paymentIntentIdFrom(object: unknown): string | null {
  if (typeof object !== "object" || object === null) return null;
  const value = (object as { payment_intent?: unknown }).payment_intent;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null) {
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  }
  return null;
}

const swallow = (what: string) => async (error: unknown) => {
  console.error(`[stripe-webhook] ${what} failed (sweep will recover):`, error);
  await reportError(error, {
    context: "stripe-webhook.side-effect",
    tags: { side_effect: what },
  });
};

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
          .returning({ id: orders.id, totalCents: orders.totalCents });

        // Charge-vs-order backstop. The two are equal by construction — the
        // recompute writes the order row and re-prices the PaymentIntent inside
        // one transaction — but a discount-idempotency defect once made them
        // disagree SILENTLY, in both directions, and nothing anywhere compared
        // them. This is now the one place that does, and it catches divergence
        // from any cause, not just that one.
        //
        // Reported, never enforced: by the time this runs the money has already
        // moved, so refusing to confirm would turn an accounting fault into a
        // customer-facing one. `confirmed` is empty on a redelivered webhook
        // (the status guard already matched), so a retry can't re-alert. Fired
        // inside after() so the Sentry flush can't delay Stripe's 200.
        for (const order of confirmed) {
          after(() =>
            reportChargeAmountMismatch({
              orderId: order.id,
              paymentIntentId: paymentIntent.id,
              chargedCents: paymentIntent.amount_received,
              orderTotalCents: order.totalCents,
            }).catch(swallow("charge amount check")),
          );
        }
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
            // The drain claims due jobs generally — this order's fresh
            // enqueues AND any older retries whose backoff has elapsed — so
            // busy hours self-heal at order cadence (M2).
            after(() =>
              drainDueJobs({
                claimBatch: processDueJobs,
                batchSize: KICK_BATCH_SIZE,
                deadlineMs: Date.now() + KICK_DRAIN_BUDGET_MS,
              }).catch(swallow("integrations kick")),
            );
          }
        } catch (error) {
          // Swallowed by design — the sweep is the guarantee — but reported
          // (M1): a failed enqueue here is exactly the miss the sweep-backlog
          // alert would only surface a day later. Reported via after() so the
          // flush can never delay this response.
          try {
            after(() => swallow("integrations enqueue")(error));
          } catch {
            // Swallowed by design.
          }
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
          after(() =>
            depleteStockForOrder(paymentIntent.id).catch(
              swallow("stock depletion"),
            ),
          );
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
          after(() =>
            notifyNewOrder(paymentIntent.id).catch(swallow("new-order push")),
          );
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
              notifyCustomerOrder(confirmedId, "confirmed").catch(
                swallow("customer notification"),
              ),
            );
          } catch {
            // Swallowed by design.
          }
        }
        // ADDITIVE (loyalty) — credit points to a LINKED customer on the ACTUAL
        // confirmation transition. Same best-effort contract as the blocks
        // above: gated on confirmed.length (earn once per order), isolated, and
        // done in after() so it can never delay or fail this response.
        // Idempotent via the ledger's unique(order_id, reason) index; a no-op
        // for guest orders and loyalty-disabled venues. sweepLoyaltyEarn()
        // (cron) re-derives any earn missed here — e.g. if the customer link
        // (claimOrder) landed after this webhook.
        if (confirmed.length > 0) {
          try {
            after(() =>
              earnPointsForOrder(paymentIntent.id).catch(
                swallow("loyalty earn"),
              ),
            );
          } catch {
            // Swallowed by design — the sweep is the guarantee.
          }
        }
        // ADDITIVE (loyalty · PR2) — debit the points this order redeemed, now
        // that it's paid. Same best-effort contract: gated on the confirmation
        // transition, isolated, done in after(). Idempotent via the ledger's
        // unique(order_id, reason) index; a no-op unless the order actually
        // redeemed points. sweepLoyaltyRedeem() (cron) is the backstop.
        if (confirmed.length > 0) {
          try {
            after(() =>
              redeemPointsForOrder(paymentIntent.id).catch(
                swallow("loyalty redeem"),
              ),
            );
          } catch {
            // Swallowed by design — the sweep is the guarantee.
          }
        }
        // ADDITIVE (gift cards · PR2) — debit the gift card this order redeemed,
        // now that it's paid. Same best-effort contract: gated on the
        // confirmation transition, isolated, done in after(). Idempotent via the
        // ledger's unique(order_id, reason) index; a no-op unless the order
        // redeemed a card. sweepGiftCardRedeem() (cron) is the backstop.
        if (confirmed.length > 0) {
          try {
            after(() =>
              redeemGiftCardForOrder(paymentIntent.id).catch(
                swallow("gift card redeem"),
              ),
            );
          } catch {
            // Swallowed by design — the sweep is the guarantee.
          }
        }
        break;
      }
      // ADDITIVE (M4 / audit F3) — refunds issued OUT OF BAND (the Stripe
      // Dashboard, which was the merchant's only option before this
      // milestone) arrive here. Reconciling them keeps the order record,
      // loyalty, gift-card balances and stock consistent with money that
      // moved outside the product. Idempotent: rows are keyed on the Stripe
      // refund id, so replays insert nothing. Refunds issued IN product
      // already have their row — this simply finds nothing new.
      case "charge.refunded":
      case "charge.refund.updated": {
        const paymentIntentId = paymentIntentIdFrom(event.data.object);
        if (paymentIntentId) {
          await reconcileRefundsForPaymentIntent(
            paymentIntentId,
            event.account,
          );
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
  } catch (error) {
    // Persisting failed — log it, then 500 so Stripe retries the delivery.
    // Reported to the tracker first (M1): this is the money path itself
    // failing, the most alert-worthy event in the platform. The ≤2s flush
    // delays only this already-failed response; Stripe retries regardless.
    console.error("[stripe-webhook] handler error (Stripe will retry):", error);
    await reportError(error, {
      context: "stripe-webhook.handler",
      extra: { eventType: event.type },
    });
    return new Response("Handler error.", { status: 500 });
  }

  return new Response("ok", { status: 200 });
}
