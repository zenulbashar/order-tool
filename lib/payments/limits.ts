/**
 * Platform money limits that are NOT anyone's business rule.
 *
 * These describe what the payment processor will accept, so every path that
 * produces a payable amount has to respect them — the plain checkout total, and
 * equally any discounted total. Keeping them here rather than in
 * `bank-discount.ts` (where `MIN_TOTAL_CENTS` used to live) is deliberate: the
 * un-discounted checkout must honour the floor too, and `placeOrder` importing a
 * constant out of a DISCOUNT module would read like a money-path invariant
 * violation to the next person, even though a constant carries no logic.
 *
 * PURE and dependency-free on purpose. `bank-discount.ts` is used client-side
 * for the "Save $X" callout, so this cannot reach for `lib/stripe.ts` (which is
 * server-only) even though that is where the fee constants live.
 */

/**
 * Stripe's minimum chargeable amount in AUD. A PaymentIntent below this is
 * rejected by Stripe, and in `placeOrder` that rejection lands AFTER the order
 * row has been committed — so this must be enforced before any write, not
 * discovered afterwards.
 */
export const MIN_TOTAL_CENTS = 50;
