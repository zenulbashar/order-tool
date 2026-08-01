/**
 * Drain policy for the integrations outbox (M2 / audit F2): claim and run due
 * jobs in batches until the queue is empty or a deadline passes. Pure —
 * callers inject the claim function (processDueJobs) and, in tests, the
 * clock — so the roadmap's acceptance ("a backlog of 100 jobs drains within
 * one invocation") is provable without a database.
 *
 * Used by BOTH triggers of the engine:
 *  - the cron route, with the invocation's ~35s budget, and
 *  - the Stripe webhook's post-response kick, with a small budget — which
 *    turns every confirmed order into an opportunistic mini-tick, so on any
 *    active venue retries stop waiting for the next cron run.
 *
 * Stopping on the deadline with a full final batch means jobs are still due
 * (`budgetExhausted`) — callers surface that as the sweep-backlog alert.
 */
export type DrainResult = {
  processed: number;
  /** True when the loop stopped on its deadline with jobs plausibly still due. */
  budgetExhausted: boolean;
};

export async function drainDueJobs(options: {
  /** Claim + run up to N due jobs; resolves to how many actually ran. */
  claimBatch: (limit: number) => Promise<number>;
  batchSize: number;
  /** Absolute epoch-ms deadline; the loop never starts a batch past it. */
  deadlineMs: number;
  /** Injectable clock for tests; defaults to Date.now. */
  now?: () => number;
}): Promise<DrainResult> {
  const { claimBatch, batchSize, deadlineMs, now = Date.now } = options;
  let processed = 0;
  for (;;) {
    const batch = await claimBatch(batchSize);
    processed += batch;
    // A short batch means the due queue is empty — done, budget irrelevant.
    if (batch < batchSize) return { processed, budgetExhausted: false };
    if (now() > deadlineMs) return { processed, budgetExhausted: true };
  }
}
