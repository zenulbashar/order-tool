import "server-only";

import { and, eq, gt, inArray, lte, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  type IntegrationJob,
  integrationJobs,
  orders,
  type VenueIntegration,
  venueIntegrations,
} from "@/lib/db/schema";

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
 *    job.
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

/** How far back the sweep re-derives jobs from order state. */
const SWEEP_WINDOW_MS = 24 * 60 * 60 * 1000;

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
 */
export async function sweepMissedOrders(): Promise<number> {
  const since = new Date(Date.now() - SWEEP_WINDOW_MS);
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
    .where(and(eq(orders.status, "confirmed"), gt(orders.createdAt, since)));
  if (candidates.length === 0) return 0;

  await db
    .insert(integrationJobs)
    .values(
      candidates.map((candidate) => ({
        venueId: candidate.venueId,
        provider: candidate.provider,
        kind: "order_mirror" as const,
        orderId: candidate.orderId,
      })),
    )
    .onConflictDoNothing();
  return candidates.length;
}

/**
 * Claim and run due jobs (pending/failed with next_attempt_at reached), up to
 * `limit`. Each claim is an atomic guarded UPDATE — a job another invocation
 * already claimed simply returns no row and is skipped. Failures never throw
 * out of this function: they are recorded on the job + integration health
 * fields and rescheduled (or marked dead after MAX_ATTEMPTS).
 */
export async function processDueJobs(limit: number): Promise<number> {
  const now = new Date();
  const due = await db
    .select({ id: integrationJobs.id })
    .from(integrationJobs)
    .where(
      and(
        inArray(integrationJobs.status, ["pending", "failed"]),
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
      })
      .where(
        and(
          eq(integrationJobs.id, candidate.id),
          inArray(integrationJobs.status, ["pending", "failed"]),
          lte(integrationJobs.nextAttemptAt, now),
        ),
      )
      .returning();
    if (!job) continue; // claimed by a concurrent invocation

    await runClaimedJob(job);
    processed += 1;
  }
  return processed;
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
        .where(eq(integrationJobs.id, job.id));
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
      .where(eq(integrationJobs.id, job.id));
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
    const backoffSeconds =
      BACKOFF_SECONDS[Math.min(job.attempts - 1, BACKOFF_SECONDS.length - 1)] ??
      BACKOFF_SECONDS[0];

    await db
      .update(integrationJobs)
      .set({
        status: isDead ? "dead" : "failed",
        lastError: message,
        nextAttemptAt: new Date(Date.now() + backoffSeconds * 1000),
      })
      .where(eq(integrationJobs.id, job.id));
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
