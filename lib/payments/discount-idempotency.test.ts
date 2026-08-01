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
 */
describe("discountIdempotencyKey", () => {
  const ORDER = "ord_abc123";

  it("gives every revision its own key", () => {
    const keys = [1, 2, 3, 4].map((r) => discountIdempotencyKey(ORDER, r));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("is stable for the same order and revision", () => {
    // A genuine retry of the SAME transition must still dedupe — that is what
    // an idempotency key is for, and the fix must not throw it away.
    expect(discountIdempotencyKey(ORDER, 7)).toBe(
      discountIdempotencyKey(ORDER, 7),
    );
  });

  it("separates orders that reach the same revision", () => {
    expect(discountIdempotencyKey("ord_one", 2)).not.toBe(
      discountIdempotencyKey("ord_two", 2),
    );
  });

  /**
   * The exploit sequence, as revisions. Totals: 2000 -> 1800 -> 1300 -> 1800.
   * The third apply RETURNS to a total already seen, which is exactly what the
   * old amount-keyed scheme collided on.
   */
  it("does not collide when a discount sequence revisits a total", () => {
    const sequence = [
      { revision: 1, totalCents: 1800 }, // bank saving applied
      { revision: 2, totalCents: 1300 }, // gift card applied
      { revision: 3, totalCents: 1800 }, // gift card cleared — total repeats
    ];
    const keys = sequence.map((step) =>
      discountIdempotencyKey(ORDER, step.revision),
    );
    expect(new Set(keys).size).toBe(3);
    // And specifically: the two applies that share a total do NOT share a key.
    expect(keys[0]).not.toBe(keys[2]);
  });

  it("survives an A->B->A->B oscillation, which a from/to pair would not", () => {
    // points on -> off -> on -> off. A key built from (previousTotal, newTotal)
    // repeats on the third step; a revision counter cannot.
    const keys = [1, 2, 3, 4].map((r) => discountIdempotencyKey(ORDER, r));
    expect(new Set(keys).size).toBe(4);
  });

  it("encodes no amount, so no target total can ever collide", () => {
    // Structural, not incidental: the function has no amount parameter. This
    // pins that — if someone reintroduces one, the key stops being transition-
    // scoped and the original bug comes back.
    expect(discountIdempotencyKey(ORDER, 1)).not.toContain("1800");
    expect(discountIdempotencyKey.length).toBe(2);
  });

  it("rejects a revision that could collide with an earlier one", () => {
    // Revisions come from `locked.discountRevision + 1` and so start at 1. A 0
    // or a non-integer means a caller bug; minting the key anyway could reuse a
    // burnt one, so fail loudly instead.
    expect(() => discountIdempotencyKey(ORDER, 0)).toThrow();
    expect(() => discountIdempotencyKey(ORDER, -1)).toThrow();
    expect(() => discountIdempotencyKey(ORDER, 1.5)).toThrow();
    expect(() => discountIdempotencyKey(ORDER, Number.NaN)).toThrow();
  });
});
