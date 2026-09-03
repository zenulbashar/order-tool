import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  bankDiscountMismatchTelemetry,
  chargeAmountMismatchTelemetry,
  initObservability,
  isObservabilityEnabled,
  jobFailureTelemetry,
  reportChargeAmountMismatch,
  reportError,
  reportJobFailure,
  reportRequestError,
  reportSweepBacklog,
  sweepBacklogTelemetry,
  type SweepBacklog,
} from "@/lib/observability";

// The SDK is only ever loaded through a dynamic import behind the DSN guard;
// mocking it here both intercepts that import and proves the reporters call
// the transport we expect (init/captureException/captureMessage/flush).
const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  flush: vi.fn(async () => true),
  eventFiltersIntegration: vi.fn(() => ({ name: "EventFilters" })),
  functionToStringIntegration: vi.fn(() => ({ name: "FunctionToString" })),
  linkedErrorsIntegration: vi.fn(() => ({ name: "LinkedErrors" })),
  contextLinesIntegration: vi.fn(() => ({ name: "ContextLines" })),
  nodeContextIntegration: vi.fn(() => ({ name: "NodeContext" })),
}));
vi.mock("@sentry/node", () => sentry);

const DEAD_FACTS = {
  jobId: "job-1",
  venueId: "venue-1",
  provider: "square",
  kind: "order_mirror",
  attempts: 6,
  maxAttempts: 6,
};

const savedDsn = process.env.SENTRY_DSN;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SENTRY_DSN = "https://public@sentry.example/1";
});

afterEach(() => {
  if (savedDsn === undefined) delete process.env.SENTRY_DSN;
  else process.env.SENTRY_DSN = savedDsn;
});

describe("jobFailureTelemetry", () => {
  it("marks an exhausted job as a dead-letter alert", () => {
    const event = jobFailureTelemetry(DEAD_FACTS);
    expect(event.level).toBe("error");
    expect(event.alert).toBe("integration_job_dead_letter");
    expect(event.tags.alert).toBe("integration_job_dead_letter");
    expect(event.tags.provider).toBe("square");
    expect(event.tags.job_id).toBe("job-1");
    expect(event.tags.venue_id).toBe("venue-1");
    expect(event.fingerprint).toContain("integration-job-dead-letter");
    expect(event.message).toMatch(/dead-letter/i);
  });

  it("treats attempts beyond the maximum as dead too", () => {
    const event = jobFailureTelemetry({ ...DEAD_FACTS, attempts: 7 });
    expect(event.alert).toBe("integration_job_dead_letter");
  });

  it("keeps a retryable failure at warning level with no alert tag", () => {
    const event = jobFailureTelemetry({ ...DEAD_FACTS, attempts: 2 });
    expect(event.level).toBe("warning");
    expect(event.alert).toBeNull();
    expect(event.tags.alert).toBeUndefined();
    expect(event.fingerprint).toContain("integration-job-retry");
  });
});

describe("sweepBacklogTelemetry", () => {
  const cleanTick: SweepBacklog = {
    integrationJobsEnqueued: 0,
    stockDepletionsApplied: 0,
    loyaltyEarnsApplied: 0,
    loyaltyRedeemsApplied: 0,
    giftCardRedeemsApplied: 0,
    drainBudgetExhausted: false,
  };

  it("reports nothing for a clean tick", () => {
    expect(sweepBacklogTelemetry(cleanTick)).toBeNull();
  });

  it("raises the sweep_backlog alert when any sweep recovered work", () => {
    const event = sweepBacklogTelemetry({
      ...cleanTick,
      loyaltyEarnsApplied: 3,
    });
    expect(event).not.toBeNull();
    expect(event?.level).toBe("warning");
    expect(event?.alert).toBe("sweep_backlog");
    expect(event?.tags.alert).toBe("sweep_backlog");
    expect(event?.extra.recovered).toBe(3);
  });

  it("raises the alert when the drain stopped on budget, even with zero counts", () => {
    const event = sweepBacklogTelemetry({
      ...cleanTick,
      drainBudgetExhausted: true,
    });
    expect(event?.alert).toBe("sweep_backlog");
    expect(event?.tags.drain_budget_exhausted).toBe("true");
  });
});

describe("reporters with a DSN configured", () => {
  it("a forced job failure produces the dead-letter alert (M1 acceptance)", async () => {
    const failure = new Error("provider returned 500");
    await reportJobFailure(DEAD_FACTS, failure);

    expect(sentry.captureException).toHaveBeenCalledTimes(1);
    const [reported, context] = sentry.captureException.mock.calls[0];
    expect(reported).toBe(failure);
    expect(context.level).toBe("error");
    expect(context.tags.alert).toBe("integration_job_dead_letter");
    expect(context.fingerprint).toContain("integration-job-dead-letter");
    // The event must actually leave the sandbox before the invocation ends.
    expect(sentry.flush).toHaveBeenCalled();
  });

  it("a dirty sweep tick produces the sweep_backlog alert", async () => {
    await reportSweepBacklog({
      integrationJobsEnqueued: 2,
      stockDepletionsApplied: 0,
      loyaltyEarnsApplied: 0,
      loyaltyRedeemsApplied: 0,
      giftCardRedeemsApplied: 0,
      drainBudgetExhausted: false,
    });

    expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
    const [message, context] = sentry.captureMessage.mock.calls[0];
    expect(message).toMatch(/recovered 2/);
    expect(context.level).toBe("warning");
    expect(context.tags.alert).toBe("sweep_backlog");
  });

  it("a clean sweep tick reports nothing", async () => {
    await reportSweepBacklog({
      integrationJobsEnqueued: 0,
      stockDepletionsApplied: 0,
      loyaltyEarnsApplied: 0,
      loyaltyRedeemsApplied: 0,
      giftCardRedeemsApplied: 0,
      drainBudgetExhausted: false,
    });
    expect(sentry.captureMessage).not.toHaveBeenCalled();
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it("reportRequestError tags the route and never receives headers", async () => {
    const error = Object.assign(new Error("boom"), { digest: "digest-123" });
    await reportRequestError(
      error,
      { path: "/api/jobs/integrations", method: "GET" },
      {
        routerKind: "App Router",
        routePath: "/api/jobs/integrations",
        routeType: "route",
        revalidateReason: undefined,
      },
    );

    const [, context] = sentry.captureException.mock.calls[0];
    expect(context.tags.route_path).toBe("/api/jobs/integrations");
    expect(context.tags.route_type).toBe("route");
    expect(context.extra.digest).toBe("digest-123");
    expect(JSON.stringify(context)).not.toMatch(/cookie|authorization/i);
  });

  it("initObservability configures the SDK without monkey-patching", async () => {
    await initObservability();
    expect(sentry.init).toHaveBeenCalledTimes(1);
    const [options] = sentry.init.mock.calls[0];
    expect(options.dsn).toBe(process.env.SENTRY_DSN);
    expect(options.defaultIntegrations).toBe(false);
    expect(options.skipOpenTelemetrySetup).toBe(true);
    expect(options.registerEsmLoaderHooks).toBe(false);
    expect(options.sendDefaultPii).toBe(false);
    expect(options.integrations).toHaveLength(5);
  });

  it("never throws even when the SDK itself fails", async () => {
    sentry.captureException.mockImplementationOnce(() => {
      throw new Error("transport down");
    });
    await expect(
      reportError(new Error("original"), { context: "test" }),
    ).resolves.toBeUndefined();
  });
});

describe("without a DSN (dev, tests, CI)", () => {
  beforeEach(() => {
    delete process.env.SENTRY_DSN;
  });

  it("is disabled and every reporter is a silent no-op", async () => {
    expect(isObservabilityEnabled()).toBe(false);
    await initObservability();
    await reportJobFailure(DEAD_FACTS, new Error("forced failure"));
    await reportError(new Error("x"), { context: "test" });
    await reportSweepBacklog({
      integrationJobsEnqueued: 9,
      stockDepletionsApplied: 0,
      loyaltyEarnsApplied: 0,
      loyaltyRedeemsApplied: 0,
      giftCardRedeemsApplied: 0,
      drainBudgetExhausted: true,
    });
    await reportChargeAmountMismatch({
      orderId: "order-1",
      paymentIntentId: "pi_1",
      chargedCents: 1300,
      orderTotalCents: 1800,
    });

    expect(sentry.init).not.toHaveBeenCalled();
    expect(sentry.captureException).not.toHaveBeenCalled();
    expect(sentry.captureMessage).not.toHaveBeenCalled();
    expect(sentry.flush).not.toHaveBeenCalled();
  });
});

/**
 * The backstop for the discount-idempotency defect: the charge and the order
 * row are equal by construction, so any inequality is a real accounting fault
 * that a human has to reconcile. Both directions matter — the bug was symmetric,
 * so an honest diner could be OVER-charged just by toggling points.
 */
describe("chargeAmountMismatchTelemetry", () => {
  const BASE = { orderId: "order-1", paymentIntentId: "pi_1" };

  it("reports nothing when the charge matches the order", () => {
    expect(
      chargeAmountMismatchTelemetry({
        ...BASE,
        chargedCents: 1800,
        orderTotalCents: 1800,
      }),
    ).toBeNull();
  });

  it("alerts when the diner was UNDER-charged (the venue is short)", () => {
    const event = chargeAmountMismatchTelemetry({
      ...BASE,
      chargedCents: 1300,
      orderTotalCents: 1800,
    });
    expect(event).not.toBeNull();
    expect(event!.alert).toBe("charge_amount_mismatch");
    expect(event!.level).toBe("error");
    expect(event!.tags.direction).toBe("under");
    expect(event!.extra.deltaCents).toBe(-500);
    expect(event!.message).toContain("UNDER-charged");
  });

  it("alerts when the diner was OVER-charged (a refund is owed)", () => {
    const event = chargeAmountMismatchTelemetry({
      ...BASE,
      chargedCents: 1800,
      orderTotalCents: 1300,
    });
    expect(event).not.toBeNull();
    expect(event!.tags.direction).toBe("over");
    expect(event!.extra.deltaCents).toBe(500);
    expect(event!.message).toContain("OVER-charged");
  });

  it("groups every mismatch into one issue, ids in extra", () => {
    const under = chargeAmountMismatchTelemetry({
      ...BASE,
      chargedCents: 1,
      orderTotalCents: 2,
    });
    const over = chargeAmountMismatchTelemetry({
      orderId: "order-2",
      paymentIntentId: "pi_2",
      chargedCents: 9,
      orderTotalCents: 2,
    });
    expect(under!.fingerprint).toEqual(over!.fingerprint);
    expect(over!.extra.orderId).toBe("order-2");
    expect(over!.extra.paymentIntentId).toBe("pi_2");
  });

  it("catches a one-cent divergence", () => {
    // No tolerance band: these are integers written by the same transaction, so
    // "close enough" would only ever hide a real fault.
    expect(
      chargeAmountMismatchTelemetry({
        ...BASE,
        chargedCents: 1799,
        orderTotalCents: 1800,
      }),
    ).not.toBeNull();
  });
});

describe("bankDiscountMismatchTelemetry", () => {
  const bankMethods = new Set(["payto", "au_becs_debit"]);
  const base = {
    orderId: "ord_1",
    paymentIntentId: "pi_1",
    bankDiscountCents: 150,
    bankMethods,
  };

  it("reports a bank saving that a card actually paid for", () => {
    const event = bankDiscountMismatchTelemetry({ ...base, paymentMethodType: "card" });
    expect(event?.alert).toBe("bank_discount_mismatch");
    expect(event?.level).toBe("error");
    expect(event?.message).toContain("150c");
    expect(event?.message).toContain("card");
  });

  it("reports when the settling method is unknown — a saving must be provable", () => {
    expect(bankDiscountMismatchTelemetry({ ...base, paymentMethodType: null })).not.toBeNull();
  });

  it("is silent when a bank method settled the charge", () => {
    expect(bankDiscountMismatchTelemetry({ ...base, paymentMethodType: "payto" })).toBeNull();
    expect(
      bankDiscountMismatchTelemetry({ ...base, paymentMethodType: "au_becs_debit" }),
    ).toBeNull();
  });

  it("is silent when the order carried no bank saving", () => {
    expect(
      bankDiscountMismatchTelemetry({ ...base, bankDiscountCents: 0, paymentMethodType: "card" }),
    ).toBeNull();
  });
});
