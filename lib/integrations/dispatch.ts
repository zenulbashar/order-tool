import "server-only";

import { and, eq, gt, inArray, lte, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { ACTIVE_ORDER_STATUSES } from "@/lib/db/order-status";
import {
  type IntegrationJob,
  integrationJobs,
  orders,
  type VenueIntegration,
  venueIntegrations,
} from "@/lib/db/schema";
import { reportJobFailure } from "@/lib/observability";
import { advanceSweepWatermark, sweepLookbackSince } from "@/lib/sweep-watermark";

/**
 * The integrations OUTBOX engine (Track 0). Design contract:
 *
 *  - Jobs are DERIVABLE FROM ORDER STATE: the sweep re-creates any missing
 *    job for a recently confirmed order of a venue with an active
 *    integration, so the webhook's fast-path enqueue is a latency
 *    optimization only — if it ever fails (or is removed), mirroring still
 *    happens within one sweep interval. Nothing here can delay or fail an
 *    order: this module is only ever called AFTER confirmation, and every
 *    caller isolates it in its own try/catch.
 *  - Enqueueing is idempotent via UNIQUE (order_id, provider, kind) +
 *    ON CONFLICT DO NOTHING — Stripe replays, sweep overlaps, and manual
 *    retries can never double-mirror.
 *  - Claiming is atomic per row (guarded UPDATE … RETURNING), so overlapping
 *    processor invocations (cron + post-response kicks) never double-run a
 *    job. Claims carry a LEASE (next_attempt_at = now + PROCESSING_LEASE_MS):
 *    an invocation that dies mid-job no longer strands the row in
 *    'processing' — the lease expires and the job is claimable again, and
 *    completion writes are fenced on `attempts` so a slow original claimant
 *    can never overwrite a reclaim's result.
 */

type Provider = VenueIntegration["provider"];

/**
 * A provider's mirror worker. Receives the claimed job + its integration row
 * (with encrypted credentials) and performs the provider calls; returns the
 * provider-side reference to store. Throwing = retryable failure (backoff).
 */
export type JobProcessor = (
  job: IntegrationJob,
  integration: VenueIntegration,
) => Promise<{ providerRef?: string }>;

// Registered lazily inside runClaimedJob/runMaintenance via dynamic import so
// this engine module stays import-cycle-free and provider code loads only
// when a job for that provider actually runs.
async function getProcessor(provider: Provider): Promise<JobProcessor | null> {
  if (provider === "square") {
    const { mirrorOrderToSquare } = await import("./square/mirror");
    return mirrorOrderToSquare;
  }
  return null;
}

/**
 * Provider maintenance duties run from the cron route each tick (e.g. the
 * Square ≤7-day token refresh). Best-effort: a maintainer must never throw.
 */
export async function runMaintenance(): Promise<void> {
  try {
    const { maintainSquareTokens } = await import("./square/mirror");
    await maintainSquareTokens();
  } catch {
    // Maintenance is advisory; failures surface via integration health rows.
  }
}

/** Exponential backoff schedule (seconds); attempts beyond it go dead. */
const BACKOFF_SECONDS = [60, 300, 1_800, 7_200, 43_200];
const MAX_ATTEMPTS = BACKOFF_SECONDS.length + 1;

/**
 * Claim lease (M2): how long a claimed job may sit in 'processing' before it
 * is presumed crashed and becomes claimable again. Before the lease, an
 * invocation dying mid-job (deploy, OOM, timeout) stranded the row in
 * 'processing' FOREVER — no sweep touches an existing row, so the mirror was
 * silently lost. The claim now writes next_attempt_at = now + lease, and the
 * due-set includes 'processing' rows whose lease expired; re-running is safe
 * because the Square worker keys every provider call on the job id
 * (idempotency_key = job.id / job.id + "-pay") and resumes via provider_ref.
 * Must comfortably exceed the worst-case single-job runtime (the cron route
 * caps the whole invocation at 60s).
 */
const PROCESSING_LEASE_MS = 5 * 60 * 1000;

/**
 * How far back the sweep re-derives jobs from order state.
 *
 * MUST comfortably exceed the worst-case gap between successful cron runs, not
 * merely equal the schedule: Vercel cron is best-effort (a failed invocation is
 * never retried) and Hobby-plan runs land anywhere within the scheduled hour,
 * so with a daily schedule two consecutive successes can be ~25h — or ~49h —
 * apart. At exactly 24h a single dropped run permanently orphaned the orders in
 * the gap. 72h gives one-missed-run-plus-jitter headroom; sweeps are idempotent
 * (ON CONFLICT DO NOTHING), so the wider window costs only a slightly larger
 * candidate scan. Keep the five SWEEP_WINDOW_MS constants (integrations, stock,
 * loyalty earn/redeem, gift cards) in lockstep.
 */
const SWEEP_WINDOW_MS = 72 * 60 * 60 * 1000;

/**
 * Keep stored errors short and free of anything secret-shaped: message text
 * only (no stacks, no payloads), truncated. Long opaque strings (potential
 * tokens) are elided.
 */
function scrubError(error: unknown): string {
  const message =
    error instanceof Error ? error.message : "Unknown integration error.";
  return message.replace(/[A-Za-z0-9_\-.]{40,}/g, "…").slice(0, 300);
}

/**
 * Enqueue mirror jobs for the order behind a PaymentIntent, one per ACTIVE
 * integration on its venue. Resolves the order by stripe_payment_intent_id —
 * the same key the webhook's confirm UPDATE used — and only when it is
 * already 'confirmed', so a replayed event for an unconfirmed order enqueues
 * nothing. Returns the number of jobs targeted (0 = venue has no active
 * integrations — the overwhelmingly common case, one indexed read).
 */
export async function enqueueJobsForOrder(
  paymentIntentId: string,
): Promise<number> {
  const [order] = await db
    .select({ id: orders.id, venueId: orders.venueId })
    .from(orders)
    .where(
      and(
        eq(orders.stripePaymentIntentId, paymentIntentId),
        eq(orders.status, "confirmed"),
      ),
    )
    .limit(1);
  if (!order) return 0;

  const active = await db
    .select({ provider: venueIntegrations.provider })
    .from(venueIntegrations)
    .where(
      and(
        eq(venueIntegrations.venueId, order.venueId),
        eq(venueIntegrations.status, "active"),
      ),
    );
  if (active.length === 0) return 0;

  await db
    .insert(integrationJobs)
    .values(
      active.map((integration) => ({
        venueId: order.venueId,
        provider: integration.provider,
        kind: "order_mirror" as const,
        orderId: order.id,
      })),
    )
    .onConflictDoNothing();
  return active.length;
}

/**
 * The sweep (cron): re-derive any MISSING job for recently confirmed orders
 * of venues with an active integration. This is what makes the outbox a
 * guarantee rather than a best effort — the webhook enqueue can fail (or be
 * reverted) and mirroring still converges.
 *
 * Returns both the candidate count (every recent confirmed order × active
 * integration — normally all already enqueued) and the number of jobs this
 * sweep actually INSERTED. `enqueued > 0` is the honest backlog signal (M1 /
 * F5): it means the webhook fast path missed those orders, and it feeds the
 * sweep-backlog alert in the cron route. ON CONFLICT DO NOTHING … RETURNING
 * yields only the genuinely new rows, so the count is exact.
 */
export async function sweepMissedOrders(): Promise<{
  candidates: number;
  enqueued: number;
}> {
  const startedAt = new Date();
  // Anchored to the last SUCCESSFUL sweep (M2) — the 72h window is the floor,
  // an outage longer than it widens the lookback instead of orphaning orders.
  const since = await sweepLookbackSince("integrations", SWEEP_WINDOW_MS);
  const candidates = await db
    .select({
      orderId: orders.id,
      venueId: orders.venueId,
      provider: venueIntegrations.provider,
    })
    .from(orders)
    .innerJoin(
      venueIntegrations,
      and(
        eq(venueIntegrations.venueId, orders.venueId),
        eq(venueIntegrations.status, "active"),
      ),
    )
    // A partially refunded order is still a live order the venue is working, so
    // it still belongs on the POS. `refunded` stays out: a fully refunded order
    // should not be mirrored as a sale.
    .where(
      and(
        inArray(orders.status, ACTIVE_ORDER_STATUSES),
        gt(orders.createdAt, since),
      ),
    );
  if (candidates.length === 0) {
    // Uncapped scan saw the whole (empty) backlog — a completed sweep.
    await advanceSweepWatermark("integrations", startedAt);
    return { candidates: 0, enqueued: 0 };
  }

  const inserted = await db
    .insert(integrationJobs)
    .values(
      candidates.map((candidate) => ({
        venueId: candidate.venueId,
        provider: candidate.provider,
        kind: "order_mirror" as const,
        orderId: candidate.orderId,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: integrationJobs.id });
  // The scan is uncapped, so reaching here means the full lookback was
  // re-derived — advance the watermark to this sweep's start.
  await advanceSweepWatermark("integrations", startedAt);
  return { candidates: candidates.length, enqueued: inserted.length };
}

/**
 * Claim and run due jobs (pending/failed with next_attempt_at reached, plus
 * 'processing' rows whose claim LEASE expired — a crashed invocation's jobs
 * become claimable again instead of being stranded forever), up to `limit`.
 * Each claim is an atomic guarded UPDATE — a job another invocation already
 * claimed simply returns no row and is skipped; the claim itself writes the
 * lease (next_attempt_at = now + PROCESSING_LEASE_MS), so an expired-lease
 * row can be reclaimed by exactly one invocation. Failures never throw out
 * of this function: they are recorded on the job + integration health fields
 * and rescheduled (or marked dead after MAX_ATTEMPTS).
 */
export async function processDueJobs(limit: number): Promise<number> {
  const now = new Date();
  const due = await db
    .select({ id: integrationJobs.id })
    .from(integrationJobs)
    .where(
      and(
        inArray(integrationJobs.status, ["pending", "failed", "processing"]),
        lte(integrationJobs.nextAttemptAt, now),
      ),
    )
    .orderBy(integrationJobs.nextAttemptAt)
    .limit(limit);

  let processed = 0;
  for (const candidate of due) {
    const [job] = await db
      .update(integrationJobs)
      .set({
        status: "processing",
        attempts: sql`${integrationJobs.attempts} + 1`,
        // The lease: while this claim runs, the row is NOT due; if this
        // invocation dies mid-job, the row becomes claimable again when the
        // lease expires. A completed run overwrites this (success leaves the
        // due-set entirely; failure sets the real backoff).
        nextAttemptAt: new Date(Date.now() + PROCESSING_LEASE_MS),
      })
      .where(
        and(
          eq(integrationJobs.id, candidate.id),
          inArray(integrationJobs.status, ["pending", "failed", "processing"]),
          lte(integrationJobs.nextAttemptAt, now),
        ),
      )
      .returning();
    if (!job) continue; // claimed by a concurrent invocation

    // Poison guard: a clean failure dead-letters at MAX_ATTEMPTS, so attempts
    // can only exceed MAX_ATTEMPTS + 1 via repeated CRASH-reclaims (a job
    // that kills its invocation never reaches the failure path). One
    // post-crash grace run is allowed — the crash may have been the
    // deploy's fault, not the job's — then park it dead instead of letting
    // it crash a tick every lease interval forever.
    if (job.attempts > MAX_ATTEMPTS + 1) {
      await reportJobFailure(
        {
          jobId: job.id,
          venueId: job.venueId,
          provider: job.provider,
          kind: job.kind,
          attempts: job.attempts,
          maxAttempts: MAX_ATTEMPTS,
        },
        new Error(
          "Job crashed its invocation repeatedly (presumed poison); parked dead.",
        ),
      );
      await db
        .update(integrationJobs)
        .set({
          status: "dead",
          lastError: "Crashed repeatedly (presumed poison).",
        })
        .where(claimedBy(job));
      processed += 1;
      continue;
    }

    await runClaimedJob(job);
    processed += 1;
  }
  return processed;
}

/**
 * Fence for a claim's completion writes: `attempts` was incremented by THIS
 * claim, so matching on the value the claim returned makes the write a no-op
 * if the lease expired and another invocation reclaimed the job (its
 * increment changes `attempts`). Without this, a slow-but-alive original
 * claimant could overwrite the reclaim's terminal state — e.g. flip a
 * 'succeeded' row back to 'failed' and re-run a finished mirror.
 */
function claimedBy(job: IntegrationJob) {
  return and(
    eq(integrationJobs.id, job.id),
    eq(integrationJobs.attempts, job.attempts),
  );
}

async function runClaimedJob(job: IntegrationJob): Promise<void> {
  try {
    const [integration] = await db
      .select()
      .from(venueIntegrations)
      .where(
        and(
          eq(venueIntegrations.venueId, job.venueId),
          eq(venueIntegrations.provider, job.provider),
        ),
      )
      .limit(1);
    if (!integration || integration.status === "disabled") {
      // Owner disconnected while the job was queued — park it dead, quietly.
      await db
        .update(integrationJobs)
        .set({ status: "dead", lastError: "Integration disconnected." })
        .where(claimedBy(job));
      return;
    }

    const processor = await getProcessor(job.provider);
    if (!processor) {
      throw new Error(`No processor installed for ${job.provider}.`);
    }

    const result = await processor(job, integration);

    await db
      .update(integrationJobs)
      .set({
        status: "succeeded",
        lastError: null,
        ...(result.providerRef ? { providerRef: result.providerRef } : {}),
      })
      .where(claimedBy(job));
    await db
      .update(venueIntegrations)
      .set({
        lastSuccessAt: new Date(),
        consecutiveFailures: 0,
        lastError: null,
        ...(integration.status === "needs_attention"
          ? { status: "active" as const }
          : {}),
      })
      .where(eq(venueIntegrations.id, integration.id));
  } catch (error) {
    const message = scrubError(error);
    const isDead = job.attempts >= MAX_ATTEMPTS;
    // Telemetry FIRST (M1 / F5), so a dead letter is reported even if the
    // reschedule writes below fail. A dead job will never retry on its own —
    // this is the alert a human must act on; a retryable failure is a
    // warning. The reporter never throws and no-ops without a DSN.
    await reportJobFailure(
      {
        jobId: job.id,
        venueId: job.venueId,
        provider: job.provider,
        kind: job.kind,
        attempts: job.attempts,
        maxAttempts: MAX_ATTEMPTS,
      },
      error,
    );
    const backoffSeconds =
      BACKOFF_SECONDS[Math.min(job.attempts - 1, BACKOFF_SECONDS.length - 1)] ??
      BACKOFF_SECONDS[0];
    // Randomized jitter (0.5x–1.5x) so jobs that failed together — e.g. every
    // job of a venue during a provider outage — don't retry in lockstep and
    // re-hammer the provider the moment it recovers.
    const jitteredSeconds = backoffSeconds * (0.5 + Math.random());

    await db
      .update(integrationJobs)
      .set({
        status: isDead ? "dead" : "failed",
        lastError: message,
        nextAttemptAt: new Date(Date.now() + jitteredSeconds * 1000),
      })
      .where(claimedBy(job));
    await db
      .update(venueIntegrations)
      .set({
        consecutiveFailures: sql`${venueIntegrations.consecutiveFailures} + 1`,
        lastError: message,
        ...(isDead ? { status: "needs_attention" as const } : {}),
      })
      .where(
        and(
          eq(venueIntegrations.venueId, job.venueId),
          eq(venueIntegrations.provider, job.provider),
          eq(venueIntegrations.status, "active"),
        ),
      );
  }
}
