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
