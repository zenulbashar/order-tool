import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Discount re-pricing (security review S4). This drives the REAL
 * applyOrderDiscounts with only its I/O mocked, so what is under test is the
 * action's own control flow — the revision claim, the write, and the Stripe key.
 *
 * Why this file exists: lib/payments/discount-idempotency.test.ts covers the
 * pure key builder, but nothing covered the CALL SITE. Deleting
 * `discountRevision: nextRevision` from the update restored the original money
 * bug verbatim with a green suite and a clean tsc — drizzle's .set() takes an
 * all-optional source, so the missing key is not even a type error. The fix was
 * asserted only by comment. It is asserted here now.
 *
 * The bug: keying the PaymentIntent update on the TARGET AMOUNT meant a
 * composable discount sequence that revisits a total reused a burnt key. Stripe
 * REPLAYS a reused key when the body matches, so no update ran, and the charge
 * silently disagreed with the order row.
 */

// --- Mocked I/O ------------------------------------------------------------

/** The order row, modelled as real mutable state so successive applies see it. */
const state = vi.hoisted(() => ({
  venue: {
    id: "venue-1",
    stripeAccountId: "acct_1",
    paytoEnabled: true,
    mode: "flat" as const,
    value: 200, // $2.00 bank saving
    loyaltyEnabled: false,
    loyaltyRedeemValueCents: 1,
    loyaltyMinRedeemPoints: 1,
    taxEnabled: false,
    taxRateBps: 0,
  },
  order: {
    id: "order-1",
    subtotalCents: 2000,
    status: "pending_payment",
    pi: "pi_1",
    customerId: "cust-1",
    totalCents: 2000,
    discountCents: 0,
    promoDiscountCents: 0,
    pointsDiscountCents: 0,
    pointsRedeemed: 0,
    giftCardId: null as string | null,
    giftCardRedeemedCents: 0,
    appliedPromoId: null as string | null,
    discountRevision: 0,
  },
  giftCard: { id: "gc-1", balanceCents: 500, status: "active" },
  /** Every paymentIntents.update the action made, in order. */
  stripeUpdates: [] as { params: Record<string, unknown>; key: string }[],
  /** Whether the Stripe call should throw (to exercise rollback). */
  stripeThrows: false,
}));

/** Rows a select resolves to, dispatched on the requested projection. */
const rowsFor = vi.hoisted(
  () =>
    function rowsFor(cols: Record<string, unknown>): unknown[] {
      const keys = Object.keys(cols ?? {});
      if (keys.includes("paytoEnabled")) return [state.venue];
      if (keys.includes("subtotalCents")) return [state.order];
      if (keys.includes("discountRevision")) return [{ ...state.order }];
      if (keys.includes("balanceCents") && keys.includes("status")) {
        return [state.giftCard];
      }
      if (keys.includes("reserved")) return [{ reserved: 0 }];
      return [];
    },
);

const db = vi.hoisted(() => {
  function chain(rows: unknown[]) {
    const self: Record<string, unknown> = {};
    const passthrough = () => self;
    self.from = passthrough;
    self.where = passthrough;
    self.for = passthrough;
    self.limit = () => Promise.resolve(rows);
    self.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(res, rej);
    return self;
  }

  const select = (cols: Record<string, unknown>) => chain(rowsFor(cols));

  return {
    select,
    // Buffers writes and commits them only if the callback resolves, so a
    // Stripe failure genuinely rolls the row back — the property the action
    // depends on.
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
      const pending: Record<string, unknown>[] = [];
      const tx = {
        select,
        update: () => ({
          set: (values: Record<string, unknown>) => ({
            where: () => {
              pending.push(values);
              return Promise.resolve([]);
            },
          }),
        }),
      };
      const out = await cb(tx);
      for (const values of pending) Object.assign(state.order, values);
      return out;
    },
  };
});
vi.mock("@/lib/db", () => ({ db }));

const paymentIntents = vi.hoisted(() => ({
  update: vi.fn(
    async (
      _id: string,
      params: Record<string, unknown>,
      options: { idempotencyKey: string },
    ) => {
      if (state.stripeThrows) throw new Error("stripe down");
      state.stripeUpdates.push({ params, key: options.idempotencyKey });
      return { id: "pi_1", ...params };
    },
  ),
}));
vi.mock("@/lib/stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stripe")>();
  return { ...actual, getStripe: () => ({ paymentIntents }) };
});

const deps = vi.hoisted(() => ({
  resolveActivePromo: vi.fn(async () => null),
  getAvailablePoints: vi.fn(async () => 0),
  resolveGiftCardForRedemption: vi.fn(async () => null as unknown),
  getAvailableGiftCardCents: vi.fn(async () => 0),
}));
vi.mock("@/lib/promotions", () => ({
  resolveActivePromo: deps.resolveActivePromo,
}));
vi.mock("@/lib/loyalty/balance", () => ({
  getAvailablePoints: deps.getAvailablePoints,
}));
vi.mock("@/lib/giftcards/queries", () => ({
  resolveGiftCardForRedemption: deps.resolveGiftCardForRedemption,
  getAvailableGiftCardCents: deps.getAvailableGiftCardCents,
}));

const { applyOrderDiscounts } = await import(
  "@/app/[slug]/checkout/discount-actions"
);

// --- Helpers ---------------------------------------------------------------

/** Apply with the bank saving, optionally redeeming the gift card. */
function apply(withGiftCard = false) {
  return applyOrderDiscounts(
    "my-venue",
    "tok_1",
    "payto",
    undefined,
    false,
    withGiftCard ? "GIFTCODE" : undefined,
  );
}

function enableGiftCard() {
  deps.resolveGiftCardForRedemption.mockResolvedValue(state.giftCard);
  deps.getAvailableGiftCardCents.mockResolvedValue(500);
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state.order, {
    totalCents: 2000,
    discountCents: 0,
    promoDiscountCents: 0,
    pointsDiscountCents: 0,
    pointsRedeemed: 0,
    giftCardId: null,
    giftCardRedeemedCents: 0,
    appliedPromoId: null,
    discountRevision: 0,
    status: "pending_payment",
  });
  state.stripeUpdates.length = 0;
  state.stripeThrows = false;
  deps.resolveActivePromo.mockResolvedValue(null);
  deps.getAvailablePoints.mockResolvedValue(0);
  deps.resolveGiftCardForRedemption.mockResolvedValue(null);
  deps.getAvailableGiftCardCents.mockResolvedValue(0);
});

// --- The contract ----------------------------------------------------------

describe("applyOrderDiscounts — PaymentIntent re-pricing", () => {
  it("re-prices the PaymentIntent and records the revision", async () => {
    const result = await apply();

    expect(result).toMatchObject({ ok: true, totalCents: 1800 });
    expect(state.order.totalCents).toBe(1800);
    expect(state.order.discountRevision).toBe(1);
    expect(state.stripeUpdates).toHaveLength(1);
    expect(state.stripeUpdates[0].params.amount).toBe(1800);
  });

  /**
   * THE REGRESSION TEST. Totals go 2000 -> 1800 -> 1300 -> 1800: the third
   * apply returns to a total already charged. Under the old amount-keyed
   * scheme steps 1 and 3 shared a key, Stripe replayed, and the PI stayed at
   * 1300 while the row said 1800.
   */
  it("mints a distinct key when a discount sequence revisits a total", async () => {
    await apply(); //                    2000 -> 1800
    enableGiftCard();
    await apply(true); //                1800 -> 1300
    deps.resolveGiftCardForRedemption.mockResolvedValue(null);
    deps.getAvailableGiftCardCents.mockResolvedValue(0);
    await apply(); //                    1300 -> 1800  (total repeats)

    const keys = state.stripeUpdates.map((u) => u.key);
    expect(keys).toHaveLength(3);
    expect(new Set(keys).size, `keys collided: ${keys.join(", ")}`).toBe(3);

    // The two applies that share a TOTAL must not share a key.
    const amounts = state.stripeUpdates.map((u) => u.params.amount);
    expect(amounts).toEqual([1800, 1300, 1800]);
    expect(keys[0]).not.toBe(keys[2]);

    // And the row ends consistent with the last charge.
    expect(state.order.totalCents).toBe(1800);
    expect(state.order.discountRevision).toBe(3);
  });

  it("claims the revision from the LOCKED row, not a constant", async () => {
    state.order.discountRevision = 41;
    await apply();
    expect(state.order.discountRevision).toBe(42);
    expect(state.stripeUpdates[0].key).toContain("42");
  });

  it("burns no revision when the apply is a no-op", async () => {
    await apply();
    const afterFirst = state.order.discountRevision;
    const result = await apply(); // identical composition — nothing to change

    expect(result).toMatchObject({ ok: true, totalCents: 1800 });
    expect(state.order.discountRevision).toBe(afterFirst);
    expect(state.stripeUpdates).toHaveLength(1); // no second Stripe call
  });

  it("rolls the row back when Stripe rejects the re-price", async () => {
    state.stripeThrows = true;

    const result = await apply();

    expect(result).toEqual({ ok: false });
    // DB is written before the Stripe call, so the rollback is what keeps the
    // PI and the row from disagreeing. Nothing may persist.
    expect(state.order.totalCents).toBe(2000);
    expect(state.order.discountRevision).toBe(0);
  });
});
