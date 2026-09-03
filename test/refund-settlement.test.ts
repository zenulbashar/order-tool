import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Refund settlement and concurrency (audit round 2).
 *
 * Two defects in refundOrder, both about trusting a refund before Stripe has
 * finished with it:
 *
 *  - It read the order and its refunded-to-date total, planned, and inserted
 *    the pending row with no lock and without counting other PENDING rows, so
 *    two concurrent partial refunds both validated against the same headroom
 *    and both reached Stripe under distinct idempotency keys.
 *  - It recorded Stripe's `pending` as our `succeeded` and immediately ran the
 *    full-refund compensation (gift-card credit, points reversal, restock). A
 *    pending refund CAN fail; when charge.refund.updated later demoted it, the
 *    order went back to confirmed but the stored value stayed minted.
 *
 * Drives the real refundOrder / reconcile with only their I/O mocked.
 */

const state = vi.hoisted(() => ({
  /** What Stripe returns from refunds.create. */
  stripeStatus: "succeeded" as string,
  /** Aggregates the mock db reports: before the Stripe id is stamped (i.e. at
   *  planning time) and after it. */
  committedBefore: 0,
  committedAfter: 0,
  settledAfter: 0,
  stamped: false,
  /** What the order row looks like. */
  orderTotal: 5500,
  /** Observed behaviour. */
  inTransaction: false,
  lockedInTransaction: false,
  plannedInsideTransaction: false,
  inserts: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
  compensations: 0,
  /** Rows the reconcile insert reports as already present. */
  reconcileInsertConflicts: false,
}));

const db = vi.hoisted(() => {
  const updateChain = () => ({
    set: (values: Record<string, unknown>) => ({
      where: () => {
        state.updates.push(values);
        if ("stripeRefundId" in values) state.stamped = true;
        return Promise.resolve();
      },
    }),
  });
  const select = (projection: Record<string, unknown>) => {
    const keys = Object.keys(projection ?? {});
    const rows = keys.includes("stripeAccountId")
      ? [{ stripeAccountId: "acct_1" }]
      : keys.includes("total")
        ? [{ total: state.stamped ? state.settledAfter : 0 }]
        : keys.includes("committed")
          ? [{ committed: state.stamped ? state.committedAfter : state.committedBefore }]
          : keys.includes("paymentIntentId")
            ? [
                {
                  id: "ord_1",
                  venueId: "ven_1",
                  status: "confirmed",
                  totalCents: state.orderTotal,
                  paymentIntentId: "pi_1",
                },
              ]
            : [{ id: "ord_1", venueId: "ven_1", status: "confirmed", totalCents: state.orderTotal }];
    const result = {
      limit: () =>
        Object.assign(Promise.resolve(rows), {
          for: (strength: string) => {
            if (strength === "update" && state.inTransaction) {
              state.lockedInTransaction = true;
            }
            return Promise.resolve(rows);
          },
        }),
      then: (r: (v: unknown) => unknown) => Promise.resolve(rows).then(r),
    };
    return { from: () => ({ where: () => result }) };
  };
  const insert = () => ({
    values: (values: Record<string, unknown>) => {
      state.inserts.push(values);
      if (state.inTransaction) state.plannedInsideTransaction = true;
      const returning = () =>
        Promise.resolve(
          state.reconcileInsertConflicts && "stripeRefundId" in values
            ? []
            : [{ id: "rf_pending" }],
        );
      return {
        returning,
        onConflictDoNothing: () => ({ returning }),
      };
    },
  });
  const api = {
    select: vi.fn(select),
    insert: vi.fn(insert),
    update: vi.fn(updateChain),
    delete: vi.fn(() => ({ where: () => Promise.resolve() })),
    transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
      state.inTransaction = true;
      try {
        return await cb({ select, insert, update: updateChain, delete: api.delete });
      } finally {
        state.inTransaction = false;
      }
    }),
  };
  return api;
});
vi.mock("@/lib/db", () => ({ db }));

const stripe = vi.hoisted(() => ({
  refunds: {
    create: vi.fn(() =>
      Promise.resolve({ id: "re_1", status: state.stripeStatus }),
    ),
    list: vi.fn(() =>
      Promise.resolve({
        data: [{ id: "re_1", amount: 5500, status: state.stripeStatus, reason: null }],
      }),
    ),
  },
}));
vi.mock("@/lib/stripe", () => ({ getStripe: () => stripe }));
vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/payments/refund-compensation", () => ({
  compensateFullyRefundedOrder: vi.fn(async () => {
    state.compensations += 1;
    return {};
  }),
}));

const input = {
  venueId: "ven_1",
  orderId: "ord_1",
  actorUserId: "usr_1",
  reason: null,
  note: null,
};

describe("refundOrder — planning is serialised", () => {
  beforeEach(() => {
    Object.assign(state, {
      stripeStatus: "succeeded",
      committedBefore: 0,
      committedAfter: 0,
      settledAfter: 0,
      stamped: false,
      orderTotal: 5500,
      inTransaction: false,
      lockedInTransaction: false,
      plannedInsideTransaction: false,
      inserts: [],
      updates: [],
      compensations: 0,
      reconcileInsertConflicts: false,
    });
    vi.clearAllMocks();
  });

  it("locks the order row FOR UPDATE and records the pending row inside that transaction", async () => {
    const { refundOrder } = await import("@/lib/payments/refund-service");
    const result = await refundOrder({ ...input, amountCents: 1000 });
    expect(result.ok).toBe(true);
    expect(state.lockedInTransaction, "order must be locked before planning").toBe(true);
    expect(state.plannedInsideTransaction, "pending row must be written under the lock").toBe(true);
  });

  it("counts a still-pending refund toward headroom", async () => {
    // A $50 refund is in flight (pending at Stripe) on a $55 order. A second
    // $10 refund must be refused: only $5 is genuinely left.
    state.committedBefore = 5000;
    const { refundOrder } = await import("@/lib/payments/refund-service");
    const result = await refundOrder({ ...input, amountCents: 1000 });
    expect(result.ok).toBe(false);
    expect(stripe.refunds.create).not.toHaveBeenCalled();
  });
});

describe("refundOrder — settlement", () => {
  beforeEach(() => {
    Object.assign(state, {
      stripeStatus: "succeeded",
      committedBefore: 0,
      committedAfter: 0,
      settledAfter: 0,
      stamped: false,
      orderTotal: 5500,
      inserts: [],
      updates: [],
      compensations: 0,
      reconcileInsertConflicts: false,
    });
    vi.clearAllMocks();
  });

  it("records a Stripe-pending refund as pending and does NOT compensate", async () => {
    state.stripeStatus = "pending";
    // The full amount: were it settled, the order would be fully refunded.
    state.committedAfter = 5500;
    state.settledAfter = 0;
    const { refundOrder } = await import("@/lib/payments/refund-service");
    const result = await refundOrder({ ...input, amountCents: 5500 });
    expect(result.ok, "a pending refund is not a failed refund").toBe(true);
    const stamp = state.updates.find((u) => "stripeRefundId" in u);
    expect(stamp?.status).toBe("pending");
    expect(state.compensations, "stored value must wait for settlement").toBe(0);
  });

  it("compensates once the full amount has actually settled", async () => {
    state.stripeStatus = "succeeded";
    // After this refund's stamp the aggregates report the whole order settled.
    state.settledAfter = 5500;
    state.committedAfter = 5500;
    const { refundOrder } = await import("@/lib/payments/refund-service");
    const result = await refundOrder({ ...input, amountCents: 5500 });
    expect(result.ok).toBe(true);
    expect(state.compensations).toBe(1);
  });
});

describe("reconcileRefundsForPaymentIntent — settlement transitions", () => {
  beforeEach(() => {
    Object.assign(state, {
      stripeStatus: "succeeded",
      // Reconcile stamps nothing; report the settled state throughout.
      committedBefore: 5500,
      committedAfter: 5500,
      settledAfter: 5500,
      stamped: true,
      orderTotal: 5500,
      inserts: [],
      updates: [],
      compensations: 0,
      reconcileInsertConflicts: true,
    });
    vi.clearAllMocks();
  });

  it("promotes our pending row when Stripe reports the refund succeeded", async () => {
    const { reconcileRefundsForPaymentIntent } = await import(
      "@/lib/payments/refund-service"
    );
    await reconcileRefundsForPaymentIntent("pi_1", "acct_1");
    expect(state.updates.some((u) => u.status === "succeeded")).toBe(true);
    expect(state.compensations, "settled in full -> compensate").toBe(1);
  });

  it("records a refund Stripe still reports pending as pending", async () => {
    state.stripeStatus = "pending";
    state.reconcileInsertConflicts = false;
    state.settledAfter = 0;
    const { reconcileRefundsForPaymentIntent } = await import(
      "@/lib/payments/refund-service"
    );
    await reconcileRefundsForPaymentIntent("pi_1", "acct_1");
    const inserted = state.inserts.find((i) => "stripeRefundId" in i);
    expect(inserted?.status).toBe("pending");
    expect(state.compensations).toBe(0);
  });
});
