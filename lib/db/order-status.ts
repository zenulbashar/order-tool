/**
 * Shared order-status groupings (M4 / audit F3).
 *
 * Before refunds existed, "the order took money" and "the order is
 * `confirmed`" were the same predicate, so `eq(status, 'confirmed')` was
 * written inline everywhere. Refund states break that equivalence in two
 * different directions, and the two must not be conflated:
 *
 *  - A PARTIALLY refunded order is still live. The kitchen may well be
 *    cooking it (a goodwill refund on a late order does not cancel the food),
 *    so it must stay on the board and keep its table occupied.
 *  - A FULLY refunded order is finished, but it still HAPPENED — it belongs
 *    in the diner's history and in the venue's records, just not in revenue
 *    at face value.
 *
 * Keep these lists as the single definition so a future status is a one-line
 * change rather than a hunt through call sites.
 */

/** Money was taken for this order at some point. Use for history/records. */
export const PAID_ORDER_STATUSES = [
  "confirmed",
  "partially_refunded",
  "refunded",
] as const;

/**
 * The order is still a live, working order — it belongs on the kitchen board
 * and holds its table. Excludes fully refunded (that order is done).
 */
export const ACTIVE_ORDER_STATUSES = ["confirmed", "partially_refunded"] as const;

/**
 * Statuses a `payment_intent.succeeded` webhook may promote to `confirmed`.
 *
 * `payment_failed` is in this list, and that is the whole point. Checkout retries
 * against the SAME PaymentIntent — a decline puts it back to
 * `requires_payment_method` precisely so it can be re-confirmed — so the real
 * sequence for "card declined, diner tries another card" is
 * `payment_intent.payment_failed` followed by `payment_intent.succeeded` for one
 * `pi_`. While the success write required `pending_payment`, that second event
 * matched zero rows: the venue was paid and the order was stranded forever,
 * fulfilling nothing, alerting nothing, and telling the diner in writing that no
 * charge had been made.
 *
 * `confirmed` is deliberately ABSENT, which is what keeps the write idempotent —
 * a redelivered success still matches nothing and fires no side effect twice.
 * The refund states are absent for the same reason: money that has already gone
 * back must never be resurrected by a late event. `cancelled` is absent because
 * a cancelled order's intent should never succeed, and if it somehow does, that
 * is a case for a human rather than for silent fulfilment.
 */
export const CONFIRMABLE_ORDER_STATUSES = [
  "pending_payment",
  "payment_failed",
] as const;


/**
 * Statuses in which an order still HOLDS gift-card or points value that may not
 * have been debited yet.
 *
 * Wider than {@link ACTIVE_ORDER_STATUSES} because the debit does not land
 * with the confirmation — the webhook flips status in one auto-committed UPDATE
 * and schedules the debit in a swallowed `after()` that itself requires
 * `confirmed`, so the debit can only run afterwards. During that window the
 * order is live and its value is spoken for, but the balance has not moved.
 *
 * Callers pair this with a check that no debit ledger row exists yet, so a hold
 * is released the moment the value actually leaves. Fully refunded orders are
 * absent: their value has come back.
 */
export const HOLDING_ORDER_STATUSES = [
  "pending_payment",
  "payment_failed",
  "confirmed",
  "partially_refunded",
] as const;
