import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Stripe webhook idempotency (M3 / audit F8 — "webhook replay test asserting
 * idempotency"). This drives the REAL route handler with only its I/O mocked,
 * so the property under test is the handler's own control flow.
 *
 * The property that matters for money: the confirm UPDATE is guarded on
 * `status = 'pending_payment'` and its `.returning()` captures the ACTUAL
 * transition. Stripe retries and duplicate deliveries are routine, so every
 * side effect that MOVES VALUE — loyalty earn, loyalty redeem, gift-card
 * redeem — plus the customer notification is gated on that transition. A
 * replay must therefore credit no points, debit no gift card, and send no
 * second email. Anything that regresses that gate double-credits real
 * customers, and no unit test previously covered it.
 */

// --- Mocked I/O ------------------------------------------------------------

const after = vi.hoisted(() => {
  const pending: Promise<unknown>[] = [];
  const fn = vi.fn((cb: () => unknown) => {
    // Run post-response work immediately and remember the promise so tests can
    // await it; the real runtime awaits it via waitUntil.
    pending.push(Promise.resolve().then(cb));
  });
  return Object.assign(fn, { pending });
});
vi.mock("next/server", () => ({ after }));

const constructEvent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({ webhooks: { constructEvent } }),
}));

/** Rows the guarded confirm UPDATE returns: 1 row = real transition, 0 = replay. */
const dbState = vi.hoisted(() => ({
  confirmRows: [] as { id: string }[],
  updates: [] as Record<string, unknown>[],
  failOnUpdate: false,
}));

const db = vi.hoisted(() => ({
  update: vi.fn(() => ({
    set: vi.fn((values: Record<string, unknown>) => ({
      where: vi.fn(() => {
        if (dbState.failOnUpdate) {
          return Promise.reject(new Error("db unavailable"));
        }
        dbState.updates.push(values);
        const rows = dbState.confirmRows;
        // Awaitable directly (payment_failed) and via .returning() (succeeded).
        return Object.assign(Promise.resolve(rows), {
          returning: () => Promise.resolve(rows),
        });
      }),
    })),
  })),
}));
vi.mock("@/lib/db", () => ({ db }));

const sideEffects = vi.hoisted(() => ({
  enqueueJobsForOrder: vi.fn(async () => 1),
  processDueJobs: vi.fn(async () => 0),
  drainDueJobs: vi.fn(async () => ({ processed: 0, budgetExhausted: false })),
  depleteStockForOrder: vi.fn(async () => 0),
  notifyNewOrder: vi.fn(async () => undefined),
  notifyCustomerOrder: vi.fn(async () => undefined),
  earnPointsForOrder: vi.fn(async () => 0),
  redeemPointsForOrder: vi.fn(async () => 0),
  redeemGiftCardForOrder: vi.fn(async () => 0),
  // Typed via the generic so `.mock.calls` is inspectable without declaring
  // unused parameters.
  reportError:
    vi.fn<(error: unknown, options: { context: string }) => Promise<void>>(
      async () => undefined,
    ),
}));
vi.mock("@/lib/integrations/dispatch", () => ({
  enqueueJobsForOrder: sideEffects.enqueueJobsForOrder,
  processDueJobs: sideEffects.processDueJobs,
}));
vi.mock("@/lib/integrations/drain", () => ({
  drainDueJobs: sideEffects.drainDueJobs,
}));
vi.mock("@/lib/stock/depletion", () => ({
  depleteStockForOrder: sideEffects.depleteStockForOrder,
}));
vi.mock("@/lib/push", () => ({ notifyNewOrder: sideEffects.notifyNewOrder }));
vi.mock("@/lib/customer/notify", () => ({
  notifyCustomerOrder: sideEffects.notifyCustomerOrder,
}));
vi.mock("@/lib/loyalty/earn", () => ({
  earnPointsForOrder: sideEffects.earnPointsForOrder,
}));
vi.mock("@/lib/loyalty/redeem", () => ({
  redeemPointsForOrder: sideEffects.redeemPointsForOrder,
}));
vi.mock("@/lib/giftcards/redeem", () => ({
  redeemGiftCardForOrder: sideEffects.redeemGiftCardForOrder,
}));
vi.mock("@/lib/observability", () => ({ reportError: sideEffects.reportError }));

// Imported after the mocks are registered.
const { POST } = await import("@/app/api/stripe/webhook/route");

// --- Helpers ---------------------------------------------------------------

const PI_ID = "pi_test_123";

/** The value-moving side effects — every one must fire at most ONCE per order. */
const VALUE_MOVING = [
  ["loyalty earn", sideEffects.earnPointsForOrder],
  ["loyalty redeem", sideEffects.redeemPointsForOrder],
  ["gift card redeem", sideEffects.redeemGiftCardForOrder],
  ["customer notification", sideEffects.notifyCustomerOrder],
] as const;

function succeededEvent(id = PI_ID) {
  return {
    type: "payment_intent.succeeded",
    data: { object: { id } },
  };
}

function request(body = "{}"): Request {
  return new Request("https://example.test/api/stripe/webhook", {
    method: "POST",
    body,
    headers: { "stripe-signature": "t=1,v1=deadbeef" },
  });
}

/** Deliver one webhook and settle everything it scheduled via after(). */
async function deliver(body = "{}"): Promise<Response> {
  const response = await POST(request(body));
  await Promise.all(after.pending.splice(0));
  return response;
}

const savedSecret = process.env.STRIPE_WEBHOOK_SECRET;

beforeEach(() => {
  vi.clearAllMocks();
  after.pending.length = 0;
  dbState.confirmRows = [{ id: "order-1" }];
  dbState.updates = [];
  dbState.failOnUpdate = false;
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  constructEvent.mockImplementation(() => succeededEvent());
});

afterEach(() => {
  if (savedSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
  else process.env.STRIPE_WEBHOOK_SECRET = savedSecret;
});

// --- The contract ----------------------------------------------------------

describe("payment_intent.succeeded — first delivery", () => {
  it("confirms the order and fires every value-moving side effect once", async () => {
    const response = await deliver();

    expect(response.status).toBe(200);
    expect(dbState.updates).toEqual([{ status: "confirmed" }]);
    for (const [name, effect] of VALUE_MOVING) {
      expect(effect, `${name} should fire exactly once`).toHaveBeenCalledTimes(1);
    }
    // Ungated best-effort touches also run.
    expect(sideEffects.depleteStockForOrder).toHaveBeenCalledTimes(1);
    expect(sideEffects.notifyNewOrder).toHaveBeenCalledTimes(1);
  });

  it("resolves the order only by PaymentIntent id, never a client value", async () => {
    await deliver();
    expect(sideEffects.enqueueJobsForOrder).toHaveBeenCalledWith(PI_ID);
    expect(sideEffects.depleteStockForOrder).toHaveBeenCalledWith(PI_ID);
  });

  it("kicks the integrations drain when jobs were enqueued", async () => {
    await deliver();
    expect(sideEffects.drainDueJobs).toHaveBeenCalledTimes(1);
  });

  it("skips the drain kick when the venue has no active integration", async () => {
    sideEffects.enqueueJobsForOrder.mockResolvedValueOnce(0);
    await deliver();
    expect(sideEffects.drainDueJobs).not.toHaveBeenCalled();
  });
});

describe("payment_intent.succeeded — REPLAY (the idempotency contract)", () => {
  it("moves no value when the order is already confirmed", async () => {
    // Stripe redelivers; the guarded UPDATE matches nothing this time.
    dbState.confirmRows = [];

    const response = await deliver();

    expect(response.status).toBe(200); // acknowledged, so Stripe stops retrying
    for (const [name, effect] of VALUE_MOVING) {
      expect(effect, `${name} must NOT fire on a replay`).not.toHaveBeenCalled();
    }
  });

  it("credits points exactly once across three deliveries of one event", async () => {
    await deliver(); // real transition
    dbState.confirmRows = []; // subsequent deliveries find it confirmed
    await deliver();
    await deliver();

    expect(sideEffects.earnPointsForOrder).toHaveBeenCalledTimes(1);
    expect(sideEffects.redeemPointsForOrder).toHaveBeenCalledTimes(1);
    expect(sideEffects.redeemGiftCardForOrder).toHaveBeenCalledTimes(1);
    expect(sideEffects.notifyCustomerOrder).toHaveBeenCalledTimes(1);
  });

  it("still runs the idempotent backstops that self-guard", async () => {
    // Stock depletion and the integrations enqueue are idempotent by their own
    // unique indexes, so they intentionally run on replays too — this pins
    // that intent so a future change is a decision, not an accident.
    dbState.confirmRows = [];
    await deliver();
    expect(sideEffects.enqueueJobsForOrder).toHaveBeenCalledTimes(1);
    expect(sideEffects.depleteStockForOrder).toHaveBeenCalledTimes(1);
  });
});

describe("verification is non-negotiable", () => {
  it("rejects an invalid signature without touching the database", async () => {
    constructEvent.mockImplementation(() => {
      throw new Error("bad signature");
    });

    const response = await deliver();

    expect(response.status).toBe(400);
    expect(db.update).not.toHaveBeenCalled();
    for (const [, effect] of VALUE_MOVING) expect(effect).not.toHaveBeenCalled();
  });

  it("fails safe when the signing secret is absent", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;

    const response = await deliver();

    expect(response.status).toBe(400);
    expect(constructEvent).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("rejects a request with no signature header", async () => {
    const response = await POST(
      new Request("https://example.test/api/stripe/webhook", {
        method: "POST",
        body: "{}",
      }),
    );
    expect(response.status).toBe(400);
    expect(db.update).not.toHaveBeenCalled();
  });
});

describe("other event types", () => {
  it("marks a failed payment without moving any value", async () => {
    constructEvent.mockImplementation(() => ({
      type: "payment_intent.payment_failed",
      data: { object: { id: PI_ID } },
    }));

    const response = await deliver();

    expect(response.status).toBe(200);
    expect(dbState.updates).toEqual([{ status: "payment_failed" }]);
    for (const [, effect] of VALUE_MOVING) expect(effect).not.toHaveBeenCalled();
  });

  it("acknowledges unrelated events so Stripe stops resending them", async () => {
    constructEvent.mockImplementation(() => ({
      type: "charge.updated",
      data: { object: { id: "ch_1" } },
    }));

    const response = await deliver();

    expect(response.status).toBe(200);
    expect(db.update).not.toHaveBeenCalled();
  });
});

describe("persistence failure", () => {
  it("500s so Stripe retries, and reports the failure", async () => {
    dbState.failOnUpdate = true;

    const response = await deliver();

    expect(response.status).toBe(500);
    expect(sideEffects.reportError).toHaveBeenCalledTimes(1);
    const [, options] = sideEffects.reportError.mock.calls[0];
    expect(options.context).toBe("stripe-webhook.handler");
  });
});
