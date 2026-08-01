import { describe, expect, it } from "vitest";

import {
  normalizeRefundReason,
  orderStatusForRefunds,
  planRefund,
  remainingRefundableCents,
} from "@/lib/payments/refund";
import { shouldRestock } from "@/lib/payments/refund-compensation";

/**
 * Refund policy (M4 / audit F3). These are the rules that stand between a
 * merchant click and real money leaving a venue's balance.
 */

const PAID = { orderTotalCents: 5000, alreadyRefundedCents: 0, orderStatus: "confirmed" };

function expectRejected(result: ReturnType<typeof planRefund>): string {
  expect(result.ok).toBe(false);
  return result.ok ? "" : result.error;
}

describe("planRefund — amounts", () => {
  it("refunds the whole remaining balance when no amount is given", () => {
    const plan = planRefund(PAID);
    expect(plan).toEqual({
      ok: true,
      amountCents: 5000,
      nextOrderStatus: "refunded",
      isFullRefund: true,
    });
  });

  it("treats a partial amount as partially_refunded", () => {
    const plan = planRefund({ ...PAID, requestedCents: 1500 });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.amountCents).toBe(1500);
    expect(plan.nextOrderStatus).toBe("partially_refunded");
    expect(plan.isFullRefund).toBe(false);
  });

  it("completes to 'refunded' when a later refund clears the remainder", () => {
    const plan = planRefund({
      orderTotalCents: 5000,
      alreadyRefundedCents: 1500,
      orderStatus: "partially_refunded",
      requestedCents: 3500,
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.nextOrderStatus).toBe("refunded");
  });

  it("defaults to the REMAINDER, not the order total, on a re-refund", () => {
    const plan = planRefund({
      orderTotalCents: 5000,
      alreadyRefundedCents: 2000,
      orderStatus: "partially_refunded",
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.amountCents).toBe(3000);
  });

  it("never lets refunds exceed the order total, across many partials", () => {
    const error = expectRejected(
      planRefund({
        orderTotalCents: 5000,
        alreadyRefundedCents: 4900,
        orderStatus: "partially_refunded",
        requestedCents: 200,
      }),
    );
    expect(error).toMatch(/at most \$1\.00/);
  });

  it("rejects zero, negative and fractional-cent amounts", () => {
    expect(expectRejected(planRefund({ ...PAID, requestedCents: 0 }))).toMatch(
      /greater than zero/,
    );
    expect(expectRejected(planRefund({ ...PAID, requestedCents: -500 }))).toMatch(
      /greater than zero/,
    );
    expect(
      expectRejected(planRefund({ ...PAID, requestedCents: 10.5 })),
    ).toMatch(/whole cents/);
  });
});

describe("planRefund — which orders may be refunded", () => {
  it("allows a paid order and a partly refunded one", () => {
    expect(planRefund(PAID).ok).toBe(true);
    expect(
      planRefund({
        ...PAID,
        orderStatus: "partially_refunded",
        alreadyRefundedCents: 1000,
      }).ok,
    ).toBe(true);
  });

  it.each([
    ["pending_payment", "Only a paid order can be refunded."],
    ["cancelled", "Only a paid order can be refunded."],
    ["payment_failed", "Only a paid order can be refunded."],
    ["refunded", "This order is already fully refunded."],
  ])("refuses a %s order", (status, message) => {
    expect(expectRejected(planRefund({ ...PAID, orderStatus: status }))).toBe(
      message,
    );
  });

  it("refuses when nothing is left to refund", () => {
    expect(
      expectRejected(
        planRefund({
          orderTotalCents: 5000,
          alreadyRefundedCents: 5000,
          orderStatus: "partially_refunded",
        }),
      ),
    ).toBe("This order is already fully refunded.");
  });
});

describe("orderStatusForRefunds", () => {
  it("derives the order's status from refunds to date", () => {
    expect(orderStatusForRefunds(5000, 0)).toBe("confirmed");
    expect(orderStatusForRefunds(5000, 1)).toBe("partially_refunded");
    expect(orderStatusForRefunds(5000, 4999)).toBe("partially_refunded");
    expect(orderStatusForRefunds(5000, 5000)).toBe("refunded");
    // Defensive: an out-of-band over-refund still reads as fully refunded.
    expect(orderStatusForRefunds(5000, 6000)).toBe("refunded");
  });
});

describe("remainingRefundableCents", () => {
  it("never goes negative", () => {
    expect(remainingRefundableCents(5000, 0)).toBe(5000);
    expect(remainingRefundableCents(5000, 5000)).toBe(0);
    expect(remainingRefundableCents(5000, 9999)).toBe(0);
  });
});

describe("normalizeRefundReason", () => {
  it("passes through Stripe's vocabulary and drops anything else", () => {
    expect(normalizeRefundReason("requested_by_customer")).toBe(
      "requested_by_customer",
    );
    expect(normalizeRefundReason("duplicate")).toBe("duplicate");
    expect(normalizeRefundReason("fraudulent")).toBe("fraudulent");
    // A hostile or stale client value never reaches Stripe.
    expect(normalizeRefundReason("'; DROP TABLE refunds; --")).toBeUndefined();
    expect(normalizeRefundReason(null)).toBeUndefined();
    expect(normalizeRefundReason(42)).toBeUndefined();
  });
});

describe("shouldRestock", () => {
  it("returns ingredients only for an order the kitchen had not made", () => {
    expect(shouldRestock("new")).toBe(true);
    expect(shouldRestock("preparing")).toBe(true);
  });

  it("does NOT restock food that was already made", () => {
    // The ingredients really were consumed; putting them back would overstate
    // inventory and, downstream, under-order supplies.
    expect(shouldRestock("ready")).toBe(false);
    expect(shouldRestock("completed")).toBe(false);
  });
});
