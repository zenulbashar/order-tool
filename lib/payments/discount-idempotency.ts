/**
 * Stripe idempotency key for the PaymentIntent re-price in applyOrderDiscounts.
 *
 * An idempotency key must identify a state TRANSITION. The original key was
 * `${orderId}-disc-${targetAmount}` — a function of the DESTINATION only — and
 * that was a live money bug:
 *
 *   1. Apply the bank saving   -> total 1800c, key "…-disc-1800" burnt, PI 1800
 *   2. Apply a $5 gift card    -> total 1300c, key "…-disc-1300",      PI 1300
 *   3. Clear the gift card     -> total 1800c, key "…-disc-1800" AGAIN
 *
 * Discounts are composable, so step 3 is an ordinary thing for a diner to do —
 * and the request body Stripe sees is byte-identical to step 1's, because the
 * application fee is a pure function of the amount. Stripe therefore REPLAYS the
 * cached response rather than rejecting the reuse: no update runs, the PI stays
 * at 1300, and the order row — already written earlier in the same transaction —
 * says 1800. The replay is an HTTP 200, so nothing throws and nothing rolls back.
 *
 * It is symmetric, so it is not only an attack: a diner ticking points on, off,
 * and on again lands the PI on the HIGHER amount and is overcharged.
 *
 * Keying on a monotonic per-order revision fixes it at the root. A from/to pair
 * would not: an A->B->A->B oscillation repeats the pair, while the counter never
 * repeats. Verifying the returned PaymentIntent's `amount` would not either —
 * the replayed body IS the earlier successful response, so it already carries
 * the expected amount.
 *
 * Pure and amount-free by construction: there is no parameter here that a
 * repeated target total could collide on.
 */
export function discountIdempotencyKey(
  orderId: string,
  revision: number,
): string {
  if (!Number.isInteger(revision) || revision < 1) {
    // Revisions come from `locked.discountRevision + 1`, so this is a
    // programming error, not a diner input. Fail loudly rather than mint a key
    // that could collide with a previous one.
    throw new Error(`discountIdempotencyKey: bad revision ${revision}`);
  }
  return `${orderId}-disc-r${revision}`;
}
