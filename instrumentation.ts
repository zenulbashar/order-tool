import type { Instrumentation } from "next";

/**
 * Server observability bootstrap (M1 / audit F5). `register` runs once per
 * server instance and initialises the error reporter; `onRequestError` is
 * Next's hook for every server-side error it captures (Server Component
 * renders, route handlers, server actions), so failures with no manual
 * reporting — e.g. placeOrder's re-thrown transaction errors — are still
 * visible in the tracker.
 *
 * Both are complete no-ops unless SENTRY_DSN is set. Node runtime only: every
 * instrumented path (Stripe webhook, placeOrder, the jobs cron) runs on the
 * Node runtime and the app has no Edge routes; the guard keeps @sentry/node
 * out of any future Edge bundle.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initObservability } = await import("./lib/observability");
    await initObservability();
  }
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  errorContext,
) => {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { reportRequestError } = await import("./lib/observability");
    // Pass a narrowed request object — never the headers (cookies/PII).
    await reportRequestError(
      error,
      { path: request.path, method: request.method },
      errorContext,
    );
  }
};
