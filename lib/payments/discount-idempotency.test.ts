import { describe, expect, it } from "vitest";

import { discountIdempotencyKey } from "./discount-idempotency";

/**
 * Regression tests for the PaymentIntent re-price key.
 *
 * The defect these pin: the key used to be `${orderId}-disc-${targetAmount}`.
 * Because discounts are composable, a diner can land on the same total twice,
 * and the second call reused a burnt key. Stripe replays a reused key when the
 * request body matches (the application fee is a pure function of the amount,
 * so it always matched) — so no update ran, the PaymentIntent stayed on the
 * OTHER amount, and the order row, already written in the same transaction,
 * disagreed with what the diner was actually charged.
 *
 * The key now carries the revision AND the target. The two halves defend
 * different things and the tests below are split the same way: the revision
 * stops a repeated TOTAL from colliding, and the target stops a repeated
 * REVISION (which only happens when a rollback reverted the row) from turning
 * into a Stripe idempotency error that wedges the order.
 */
describe("discountIdempotencyKey", () => {
  const ORDER = "ord_abc123";

  describe("the revision half — a repeated total must not collide", () => {
    /**
     * The exploit sequence. Totals: 2000 -> 1800 -> 1300 -> 1800. The third
     * apply RETURNS to a total already seen, which is exactly what the old
     * amount-only key collided on.
     */
    it("does not collide when a discount sequence revisits a total", () => {
      const sequence = [
        { revision: 1, totalCents: 1800 }, // bank saving applied
        { revision: 2, totalCents: 1300 }, // gift card applied
        { revision: 3, totalCents: 1800 }, // gift card cleared — total repeats
      ];
      const keys = sequence.map((step) =>
        discountIdempotencyKey(ORDER, step.revision, step.totalCents),
      );
      expect(new Set(keys).size).toBe(3);
      // Specifically: the two applies that SHARE a total do not share a key.
      expect(keys[0]).not.toBe(keys[2]);
    });

    it("survives an A->B->A->B oscillation, which a from/to pair would not", () => {
      // points on -> off -> on -> off. A key built from (previousTotal,
      // newTotal) repeats on the third step; the revision cannot.
      const keys = [
        discountIdempotencyKey(ORDER, 1, 1300),
        discountIdempotencyKey(ORDER, 2, 1800),
        discountIdempotencyKey(ORDER, 3, 1300),
        discountIdempotencyKey(ORDER, 4, 1800),
      ];
      expect(new Set(keys).size).toBe(4);
    });

    it("gives every revision its own key at a fixed total", () => {
      const keys = [1, 2, 3, 4].map((r) =>
        discountIdempotencyKey(ORDER, r, 1800),
      );
      expect(new Set(keys).size).toBe(keys.length);
    });
  });

  describe("the target half — a repeated revision must not wedge the order", () => {
    /**
     * A revision can only repeat when the transaction rolled back after Stripe
     * had already succeeded, reverting discount_revision with everything else.
     * If the diner has since changed the discount, the retry carries a different
     * body — and Stripe answers a reused key with a changed body by ERRORING,
     * not replaying. Without the target in the key that error repeats forever
     * and the order can never be re-priced again.
     */
    it("separates a reused revision that now targets a different total", () => {
      expect(discountIdempotencyKey(ORDER, 5, 1800)).not.toBe(
        discountIdempotencyKey(ORDER, 5, 1300),
      );
    });

    it("replays a genuine retry of the very same transition", () => {
      // Same order, same revision, same destination = the identical update the
      // rolled-back attempt made. Replaying is correct, and is what an
      // idempotency key is for — the fix must not throw that away.
      //
      // Pinned against the literal key rather than against a second call to
      // itself: comparing f(x) to f(x) is true for every possible
      // implementation, including a broken one, so it asserts nothing.
      expect(discountIdempotencyKey(ORDER, 5, 1800)).toBe(
        `${ORDER}-disc-r5-1800`,
      );
    });
  });

  it("separates orders that reach the same revision and total", () => {
    expect(discountIdempotencyKey("ord_one", 2, 1800)).not.toBe(
      discountIdempotencyKey("ord_two", 2, 1800),
    );
  });

  it("rejects inputs that could collide with an earlier key", () => {
    // Revisions come from `locked.discountRevision + 1` and so start at 1; a 0,
    // a negative or a non-integer means a caller bug, and minting the key anyway
    // could reuse a burnt one. Totals are integer cents and clamped >= 0
    // upstream. Fail loudly rather than guess.
    expect(() => discountIdempotencyKey(ORDER, 0, 1800)).toThrow();
    expect(() => discountIdempotencyKey(ORDER, -1, 1800)).toThrow();
    expect(() => discountIdempotencyKey(ORDER, 1.5, 1800)).toThrow();
    expect(() => discountIdempotencyKey(ORDER, Number.NaN, 1800)).toThrow();
    expect(() => discountIdempotencyKey(ORDER, 1, -1)).toThrow();
    expect(() => discountIdempotencyKey(ORDER, 1, 12.5)).toThrow();
  });
});
