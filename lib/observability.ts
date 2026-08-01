/**
 * Server-side observability (M1 / audit F5): Sentry error tracking for the
 * money and job paths — webhook, placeOrder, processDueJobs — plus the two
 * alertable conditions the audit calls out (dead-lettered jobs, non-empty
 * sweep backlogs). Everything here is designed to be inert by default:
 *
 *  - Without SENTRY_DSN this module never imports the SDK and every reporter
 *    returns immediately — dev, tests, CI, and unconfigured previews behave
 *    exactly as before.
 *  - Reporters NEVER throw. Telemetry must never fail or delay the path it
 *    observes; an internal failure logs to the function log and gives up.
 *  - Every report awaits `flush` (≤2s) because Vercel freezes the sandbox
 *    after the response — an unflushed event would silently evaporate. The
 *    cost lands on failure paths only; happy paths never call the SDK.
 *  - The SDK is initialised (instrumentation.ts → initObservability) with
 *    `defaultIntegrations: false` and `skipOpenTelemetrySetup: true`: no
 *    monkey-patching of http/console/process and no OpenTelemetry wiring.
 *    This app runs on a Next.js fork, so the SDK is kept to plain event
 *    transport plus a hand-picked set of integrations that only enrich
 *    events (error causes, source context, runtime info). One consequence:
 *    scope state is NOT request-isolated — so callers pass all context
 *    per-call and never mutate global scope.
 *
 * PII discipline: tags/extra carry opaque ids (venue, order, job) and enum-ish
 * strings only — never customer fields, request headers, or payloads.
 *
 * The pure `*Telemetry` builders are exported for unit tests: they decide
 * WHAT gets reported (level, alert tag, grouping) with no SDK involved.
 */

type SentrySdk = typeof import("@sentry/node");

type ReportLevel = "error" | "warning";

/** Values Sentry alert rules match on (tag key `alert`) — see the runbook. */
export type AlertKind = "integration_job_dead_letter" | "sweep_backlog";

export type TelemetryEvent = {
  message: string;
  level: ReportLevel;
  /** Non-null marks the event as one of the documented alert conditions. */
  alert: AlertKind | null;
  tags: Record<string, string>;
  extra: Record<string, unknown>;
  /** Groups Sentry issues by failure class rather than by venue/order. */
  fingerprint: string[];
};

/** True when a DSN is configured; every reporter no-ops otherwise. */
export function isObservabilityEnabled(): boolean {
  return Boolean(process.env.SENTRY_DSN);
}

// Cached so the SDK is imported once per server instance, and never at all
// when observability is disabled (the import sits behind the DSN guard).
let sdkPromise: Promise<SentrySdk> | null = null;

function getSdk(): Promise<SentrySdk> {
  sdkPromise ??= import("@sentry/node");
  return sdkPromise;
}

/**
 * Initialise the SDK once per server instance (called from instrumentation.ts
 * `register`). No-op without SENTRY_DSN. Errors-only: no tracing, no
 * profiling, no instrumentation of the runtime — see the module docstring.
 */
export async function initObservability(): Promise<void> {
  if (!isObservabilityEnabled()) return;
  try {
    const Sentry = await getSdk();
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment:
        process.env.SENTRY_ENVIRONMENT ??
        process.env.VERCEL_ENV ??
        process.env.NODE_ENV ??
        "development",
      // Standard Vercel-provided commit SHA; undefined locally is fine.
      release: process.env.VERCEL_GIT_COMMIT_SHA,
      sendDefaultPii: false,
      defaultIntegrations: false,
      integrations: [
        Sentry.eventFiltersIntegration(),
        Sentry.functionToStringIntegration(),
        Sentry.linkedErrorsIntegration(),
        Sentry.contextLinesIntegration(),
        Sentry.nodeContextIntegration(),
      ],
      skipOpenTelemetrySetup: true,
      registerEsmLoaderHooks: false,
    });
  } catch (error) {
    console.error("[observability] init failed (continuing without):", error);
  }
}

type ReportOptions = {
  /** Coarse origin discriminator, e.g. "stripe-webhook.handler". */
  context: string;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
};

/**
 * Report an exception with per-call context. Never throws; resolves after the
 * event is flushed (or after the ≤2s flush timeout / a reporting failure).
 */
export async function reportError(
  error: unknown,
  options: ReportOptions,
): Promise<void> {
  if (!isObservabilityEnabled()) return;
  try {
    const Sentry = await getSdk();
    Sentry.captureException(error, {
      level: "error",
      tags: { context: options.context, ...options.tags },
      extra: options.extra,
    });
    await Sentry.flush(2000);
  } catch (reportingError) {
    console.error("[observability] failed to report error:", reportingError);
  }
}

export type JobFailureFacts = {
  jobId: string;
  venueId: string;
  provider: string;
  kind: string;
  /** The attempt just consumed — the claim increments before the run. */
  attempts: number;
  maxAttempts: number;
};

/**
 * Decide what a failed integration job attempt reports. Attempts exhausted =
 * DEAD LETTER: level error + the `alert` tag rules match on — nothing will
 * retry this job, so a human must act (audit F5: "alert on dead-lettered
 * jobs"). A retryable failure is a warning grouped per provider/kind so a
 * flapping provider makes one issue, not hundreds.
 */
export function jobFailureTelemetry(facts: JobFailureFacts): TelemetryEvent {
  const dead = facts.attempts >= facts.maxAttempts;
  const tags: Record<string, string> = {
    context: "integration-job",
    provider: facts.provider,
    kind: facts.kind,
    job_id: facts.jobId,
    venue_id: facts.venueId,
  };
  if (dead) {
    return {
      message: `Integration job dead-lettered after ${facts.attempts} attempts (${facts.provider}/${facts.kind}).`,
      level: "error",
      alert: "integration_job_dead_letter",
      tags: { ...tags, alert: "integration_job_dead_letter" },
      extra: { attempts: facts.attempts, maxAttempts: facts.maxAttempts },
      fingerprint: ["integration-job-dead-letter", facts.provider, facts.kind],
    };
  }
  return {
    message: `Integration job attempt ${facts.attempts}/${facts.maxAttempts} failed (${facts.provider}/${facts.kind}); backoff retry scheduled.`,
    level: "warning",
    alert: null,
    tags,
    extra: { attempts: facts.attempts, maxAttempts: facts.maxAttempts },
    fingerprint: ["integration-job-retry", facts.provider, facts.kind],
  };
}

/** Report a failed job attempt (dead letters carry the alert tag). */
export async function reportJobFailure(
  facts: JobFailureFacts,
  error: unknown,
): Promise<void> {
  await captureTelemetry(jobFailureTelemetry(facts), error);
}

export type SweepBacklog = {
  /** Jobs the sweep had to enqueue = orders the webhook fast path missed. */
  integrationJobsEnqueued: number;
  stockDepletionsApplied: number;
  loyaltyEarnsApplied: number;
  loyaltyRedeemsApplied: number;
  giftCardRedeemsApplied: number;
  /** True when the drain loop hit its time budget with jobs still due. */
  drainBudgetExhausted: boolean;
};

/**
 * Decide what a cron tick's sweep results report. Every sweep is an
 * idempotent backstop for work the webhook should already have done, so any
 * non-zero count means the fast path silently missed money-adjacent work in
 * the last window (audit F5: "alert on any sweep that finds a non-zero
 * backlog"). All-zero (and budget not exhausted) is the healthy steady state
 * and reports nothing.
 */
export function sweepBacklogTelemetry(
  backlog: SweepBacklog,
): TelemetryEvent | null {
  const recovered =
    backlog.integrationJobsEnqueued +
    backlog.stockDepletionsApplied +
    backlog.loyaltyEarnsApplied +
    backlog.loyaltyRedeemsApplied +
    backlog.giftCardRedeemsApplied;
  if (recovered === 0 && !backlog.drainBudgetExhausted) return null;
  return {
    message: backlog.drainBudgetExhausted
      ? `Cron sweep recovered ${recovered} missed item(s) and stopped draining on its time budget with jobs still due.`
      : `Cron sweep recovered ${recovered} item(s) the webhook fast path missed.`,
    level: "warning",
    alert: "sweep_backlog",
    tags: {
      context: "jobs-cron",
      alert: "sweep_backlog",
      drain_budget_exhausted: String(backlog.drainBudgetExhausted),
    },
    extra: { ...backlog, recovered },
    fingerprint: ["sweep-backlog"],
  };
}

/** Report a cron tick's backlog (no-op when the tick was clean). */
export async function reportSweepBacklog(backlog: SweepBacklog): Promise<void> {
  const event = sweepBacklogTelemetry(backlog);
  if (!event) return;
  await captureTelemetry(event, null);
}

/**
 * Forwarder for Next's `onRequestError` instrumentation hook — every server
 * error Next captures (render, route handler, server action) lands here, so
 * paths without manual reporting are still visible. The parameter type
 * deliberately omits headers: they can carry cookies and must not reach the
 * tracker.
 */
export async function reportRequestError(
  error: unknown,
  request: { path: string; method: string },
  errorContext: {
    routerKind: string;
    routePath: string;
    routeType: string;
    renderSource?: string;
    revalidateReason?: string;
  },
): Promise<void> {
  if (!isObservabilityEnabled()) return;
  try {
    const Sentry = await getSdk();
    Sentry.captureException(error, {
      level: "error",
      tags: {
        context: "onRequestError",
        route_path: errorContext.routePath,
        route_type: errorContext.routeType,
        method: request.method,
      },
      extra: {
        path: request.path,
        routerKind: errorContext.routerKind,
        renderSource: errorContext.renderSource,
        revalidateReason: errorContext.revalidateReason,
        digest:
          typeof error === "object" && error !== null && "digest" in error
            ? (error as { digest?: unknown }).digest
            : undefined,
      },
    });
    await Sentry.flush(2000);
  } catch (reportingError) {
    console.error("[observability] failed to report error:", reportingError);
  }
}

/** Shared capture path for the builders above. Never throws. */
async function captureTelemetry(
  event: TelemetryEvent,
  error: unknown,
): Promise<void> {
  if (!isObservabilityEnabled()) return;
  try {
    const Sentry = await getSdk();
    const captureContext = {
      level: event.level,
      tags: event.tags,
      extra: event.extra,
      fingerprint: event.fingerprint,
    };
    if (error != null) {
      // The thrown error carries the stack; the builder's message travels in
      // extra so the issue title stays the real failure.
      Sentry.captureException(error, {
        ...captureContext,
        extra: { ...event.extra, telemetryMessage: event.message },
      });
    } else {
      Sentry.captureMessage(event.message, captureContext);
    }
    await Sentry.flush(2000);
  } catch (reportingError) {
    console.error("[observability] failed to report event:", reportingError);
  }
}
