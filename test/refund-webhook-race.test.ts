import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A `charge.refunded` webhook racing an in-product refund (audit L1).
 *
 * The audit files this as LOW. It is not. `stripe_refund_id` carries a partial
 * unique index, and the webhook for the refund we just created can land between
 * `refunds.create()` returning and the UPDATE that stamps its id onto our
 * pending row. That UPDATE then raises 23505.
 *
 * Left to throw, the consequences compound:
 *   - a refund that HAS moved money is reported to the operator as failed;
 *   - no venue_audit row is written, so the ledger has no actor;
 *   - the pending row is stranded forever;
 *   - and on a PARTIAL refund the operator retries. planRefund does not block
 *     the retry, because it only checks headroom — the webhook's row makes
 *     alreadyRefunded $10 of a $55 order, leaving $45 remaining, so a second
 *     $10 refund validates and creates a second REAL Stripe refund under a
 *     fresh idempotency key. The diner is refunded twice.
 *
 * This drives the real refundOrder with only its I/O mocked, so what is under
 * test is the function's own control flow.
 */

// --- Mocked I/O ------------------------------------------------------------

const state = vi.hoisted(() => ({
  /** Throw 23505 on the stamp UPDATE, as a racing webhook insert would. */
  collideOnStamp: true,
  /** Throw something else entirely on the stamp — NOT a webhook race. */
  failStampOtherwise: false,
  refundsCreated: [] as { amount: number; idempotencyKey?: string }[],
  updates: [] as Record<string, unknown>[],
  deletes: 0,
  transactions: 0,
}));

const uniqueViolation = () => Object.assign(new Error("duplicate key"), { code: "23505" });

const db = vi.hoisted(() => {
  const chain = (kind: "update" | "delete") => ({
    set: (values: Record<string, unknown>) => ({
      where: () => {
        // The stamp is the update that carries a stripeRefundId.
        if (kind === "update" && "stripeRefundId" in values) {
          if (state.failStampOtherwise) {
            return Promise.reject(new Error("connection terminated"));
          }
          if (state.collideOnStamp) return Promise.reject(uniqueViolation());
        }
        state.updates.push(values);
        return Promise.resolve();
      },
    }),
    where: () => {
      state.deletes += 1;
      return Promise.resolve();
    },
  });
  return {
    // Routed on the PROJECTION, not blind — selecting the wrong columns has to
    // be visible here, or the mock would keep every assertion green while the
    // real query read something else.
    select: vi.fn((projection: Record<string, unknown>) => {
      const keys = Object.keys(projection ?? {});
      const rows = keys.includes("stripeAccountId")
        ? [{ stripeAccountId: "acct_1" }]
        : keys.includes("total")
          ? [{ total: 0 }] // refundedCentsForOrder: nothing refunded yet
          : [
              {
                id: "ord_1",
                venueId: "ven_1",
                status: "confirmed",
                totalCents: 5500,
                paymentIntentId: "pi_1",
              },
            ];
      const result = {
        limit: () => Promise.resolve(rows),
        // The aggregate is awaited straight off .where(), with no .limit().
        then: (r: (v: unknown) => unknown) => Promise.resolve(rows).then(r),
      };
      return { from: () => ({ where: () => result }) };
    }),
    insert: vi.fn(() => ({
      values: () => ({
        returning: () => Promise.resolve([{ id: "rf_pending" }]),
      }),
    })),
    update: vi.fn(() => chain("update")),
    delete: vi.fn(() => chain("delete")),
    transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
      state.transactions += 1;
      return cb({ update: () => chain("update"), delete: () => chain("delete") });
    }),
  };
});
vi.mock("@/lib/db", () => ({ db }));

const refundsCreate = vi.hoisted(() =>
  vi.fn((params: { amount: number }, opts: { idempotencyKey?: string }) => {
    state.refundsCreated.push({ amount: params.amount, idempotencyKey: opts?.idempotencyKey });
    return Promise.resolve({ id: "re_stripe_1", status: "succeeded" });
  }),
);
vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({ refunds: { create: refundsCreate } }),
}));

vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/payments/refund-compensation", () => ({
  compensateFullyRefundedOrder: vi.fn(async () => ({})),
}));

describe("refundOrder — charge.refunded arrives mid-flight", () => {
  beforeEach(() => {
    state.collideOnStamp = true;
    state.failStampOtherwise = false;
    state.refundsCreated = [];
    state.updates = [];
    state.deletes = 0;
    state.transactions = 0;
    vi.clearAllMocks();
  });

  it("reports SUCCESS when the webhook already recorded the same refund", async () => {
    // The single most important assertion here. The old code threw, the
    // operator saw a failure, and the retry that followed is what refunded the
    // diner twice. The money moved exactly once; the caller must be told so.
    const { refundOrder } = await import("@/lib/payments/refund-service");
    const result = await refundOrder({
      venueId: "ven_1",
      orderId: "ord_1",
      amountCents: 1000,
      actorUserId: "usr_1",
      reason: "requested_by_customer",
      note: "spilled",
    });
    expect(result.ok, "a succeeded refund must not be reported as failed").toBe(true);
  });

  it("creates exactly ONE Stripe refund", async () => {
    const { refundOrder } = await import("@/lib/payments/refund-service");
    await refundOrder({
      venueId: "ven_1",
      orderId: "ord_1",
      amountCents: 1000,
      actorUserId: "usr_1",
      reason: null,
      note: null,
    });
    expect(state.refundsCreated).toHaveLength(1);
    // The pending row's id, so a resubmission reuses the same Stripe refund.
    expect(state.refundsCreated[0].idempotencyKey).toBe("rf_pending");
  });

  it("adopts the webhook's row and drops the duplicate, in one transaction", async () => {
    // The webhook inserts with actorUserId: null and note "Reconciled from
    // Stripe" — it cannot know who clicked. Adopting the row is what keeps the
    // actor attribution the audit trail needs, and deleting ours is what stops
    // the stranded pending row.
    const { refundOrder } = await import("@/lib/payments/refund-service");
    await refundOrder({
      venueId: "ven_1",
      orderId: "ord_1",
      amountCents: 1000,
      actorUserId: "usr_1",
      reason: "requested_by_customer",
      note: "spilled",
    });
    expect(state.transactions, "adopt + delete must be atomic").toBe(1);
    expect(state.deletes).toBe(1);
    const adopted = state.updates.find((u) => "actorUserId" in u);
    expect(adopted?.actorUserId).toBe("usr_1");
    expect(adopted?.note).toBe("spilled");
  });

  it("does NOT treat an unrelated DB failure as a webhook race", async () => {
    // The conflict branch claims a specific fact: "the webhook already recorded
    // this exact refund". A connection drop or a check-constraint failure
    // proves nothing of the sort, and swallowing it would adopt a row that does
    // not exist, leave ours `pending`, and still report success — a refund the
    // ledger has no succeeded record of.
    //
    // Found by mutation-testing this file: swallowing every error instead of
    // only 23505 passed every other assertion here.
    state.collideOnStamp = false;
    state.failStampOtherwise = true;
    const { refundOrder } = await import("@/lib/payments/refund-service");
    await expect(
      refundOrder({
        venueId: "ven_1",
        orderId: "ord_1",
        amountCents: 1000,
        actorUserId: "usr_1",
        reason: null,
        note: null,
      }),
    ).rejects.toThrow(/connection terminated/);
    expect(state.transactions, "must not adopt a row on an unknown failure").toBe(0);
  });

  it("still stamps normally when no webhook raced it", async () => {
    // The counterweight: the conflict path must not become the only path.
    state.collideOnStamp = false;
    const { refundOrder } = await import("@/lib/payments/refund-service");
    const result = await refundOrder({
      venueId: "ven_1",
      orderId: "ord_1",
      amountCents: 1000,
      actorUserId: "usr_1",
      reason: null,
      note: null,
    });
    expect(result.ok).toBe(true);
    expect(state.transactions, "no adoption when there is no conflict").toBe(0);
    expect(state.deletes).toBe(0);
    expect(state.updates.some((u) => "stripeRefundId" in u)).toBe(true);
  });
});
