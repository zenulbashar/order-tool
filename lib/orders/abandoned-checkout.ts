import "server-only";

import { and, asc, eq, inArray, lt } from "drizzle-orm";
import type Stripe from "stripe";

import { db } from "@/lib/db";
import { CONFIRMABLE_ORDER_STATUSES } from "@/lib/db/order-status";
import { orders, venues } from "@/lib/db/schema";
import { getStripe } from "@/lib/stripe";

/**
 * Abandoned-checkout sweep (cron backstop).
 *
 * placeOrder writes the order row BEFORE the diner pays, and only the Stripe
 * webhook ever moves it off `pending_payment` / `payment_failed`. A diner who
 * closes the tab (or whose PaymentIntent was never created) leaves that row
 * behind forever — and it is not inert: a gift-card or loyalty redemption on
 * the order counts as RESERVED for as long as the order is in a holding
 * status (see HOLDING_ORDER_STATUSES / getAvailableGiftCardCents), so an
 * abandoned $20 checkout silently kept $20 of a diner's gift card unspendable
 * with nothing anywhere to release it.
 *
 * After STALE_CHECKOUT_MS the order is treated as abandoned: its
 * PaymentIntent is cancelled on the venue's connected account FIRST, so no
 * payment can land afterwards, and only then is the row marked `cancelled`.
 * Stripe is the authority on whether money can still move — a PaymentIntent
 * that is processing or already succeeded is left alone for the webhook to
 * confirm. Idempotent and bounded: a re-run finds nothing to do, a failure on
 * one order is retried next tick.
 */

/** How long a checkout may sit unpaid before it counts as abandoned. */
export const STALE_CHECKOUT_MS = 24 * 60 * 60 * 1000;
const SWEEP_BATCH = 100;

/**
 * PaymentIntent statuses under which abandoning the order cannot lose a
 * payment: nothing has been taken, and cancelling stops anything being taken.
 * `canceled` is included because a cancelled intent's order is safe to close
 * (the previous tick may have cancelled the intent, then failed to write the
 * row). `processing`, `requires_capture` and `succeeded` mean money is in
 * motion or has arrived — the webhook, not this sweep, decides those orders.
 */
const ABANDONABLE_INTENT_STATUSES: ReadonlySet<Stripe.PaymentIntent.Status> =
  new Set([
    "requires_payment_method",
    "requires_confirmation",
    "requires_action",
    "canceled",
  ]);

export function paymentIntentCanBeAbandoned(
  status: Stripe.PaymentIntent.Status,
): boolean {
  return ABANDONABLE_INTENT_STATUSES.has(status);
}

/** Cancel stale unpaid orders. Returns how many were marked `cancelled`. */
export async function sweepAbandonedCheckouts(
  now: Date = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - STALE_CHECKOUT_MS);
  const stale = await db
    .select({
      id: orders.id,
      venueId: orders.venueId,
      paymentIntentId: orders.stripePaymentIntentId,
      stripeAccountId: venues.stripeAccountId,
    })
    .from(orders)
    .innerJoin(venues, eq(venues.id, orders.venueId))
    .where(
      and(
        inArray(orders.status, CONFIRMABLE_ORDER_STATUSES),
        lt(orders.createdAt, cutoff),
      ),
    )
    .orderBy(asc(orders.createdAt))
    .limit(SWEEP_BATCH);

  let cancelled = 0;
  for (const row of stale) {
    try {
      if (row.paymentIntentId) {
        // Direct charges live on the CONNECTED account; without it the intent
        // cannot be inspected, so leave the order for a human rather than
        // guess.
        if (!row.stripeAccountId) continue;
        const stripe = getStripe();
        const options = { stripeAccount: row.stripeAccountId };
        const intent = await stripe.paymentIntents.retrieve(
          row.paymentIntentId,
          {},
          options,
        );
        if (!paymentIntentCanBeAbandoned(intent.status)) continue;
        if (intent.status !== "canceled") {
          await stripe.paymentIntents.cancel(
            row.paymentIntentId,
            { cancellation_reason: "abandoned" },
            options,
          );
        }
      }
      // Status guard in the WHERE: if the webhook confirmed the order between
      // the select and here, this matches nothing and the confirmation stands.
      // The row's own venue_id scopes the write (tenant-scoping harness).
      const updated = await db
        .update(orders)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(orders.id, row.id),
            eq(orders.venueId, row.venueId),
            inArray(orders.status, CONFIRMABLE_ORDER_STATUSES),
          ),
        )
        .returning({ id: orders.id });
      cancelled += updated.length;
    } catch {
      // One order's Stripe hiccup must not abort the sweep; next tick retries.
    }
  }
  return cancelled;
}
