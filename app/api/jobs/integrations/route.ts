import {
  processDueJobs,
  runMaintenance,
  sweepMissedOrders,
} from "@/lib/integrations/dispatch";
import { drainDueJobs } from "@/lib/integrations/drain";
import { sweepGiftCardRedeem } from "@/lib/giftcards/redeem";
import { sweepLoyaltyEarn } from "@/lib/loyalty/earn";
import { sweepLoyaltyRedeem } from "@/lib/loyalty/redeem";
import { reportError, reportSweepBacklog } from "@/lib/observability";
import { sweepStockDepletion } from "@/lib/stock/depletion";

// The dispatch engine uses the Neon pool + node crypto — keep off Edge.
export const runtime = "nodejs";
// Room for several batches of provider calls; well under Vercel's ceiling.
export const maxDuration = 60;

/** Jobs claimed per processDueJobs call — bounds each claim query. */
const BATCH_SIZE = 10;

/**
 * Stop draining this long before maxDuration so the sweeps below always get
 * their turn even when the job backlog alone could fill the whole invocation.
 */
const DRAIN_BUDGET_MS = 35_000;

/**
 * The integrations job processor + sweep (Track 0). Invoked ONCE DAILY by
 * Vercel Cron (vercel.json, `0 3 * * *`) — cron delivery is best-effort and a
 * failed run is never retried. Two M2 mechanisms make that survivable:
 * every sweep anchors its lookback to a persisted last-successful-run
 * watermark (72h floor — an outage longer than the floor widens the window
 * instead of orphaning orders), and the opt-in GitHub Actions tick
 * (.github/workflows/job-tick.yml) can invoke this same route hourly so
 * retry backoff means minutes-to-hours, not days. The fast path is the
 * opportunistic drain after order confirmation via after() in the Stripe
 * webhook; this route is the reconciliation backstop. Because a backlog can
 * be due when it fires, it DRAINS in batches until the queue is empty or the
 * time budget is spent, rather than processing a single batch.
 *
 * Protected by CRON_SECRET (Vercel sends `Authorization: Bearer <CRON_SECRET>`;
 * the GitHub tick sends the same header); if the secret is absent we fail safe
 * and refuse, mirroring the webhook-secret discipline. Safe at ANY invocation
 * frequency: sweeps and jobs are idempotent, claims are atomic + leased, and
 * overlapping ticks skip each other's claims. This route only reads/writes
 * integration outbox state — it can never touch order confirmation.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return new Response("Cron secret is not configured.", { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized.", { status: 401 });
  }

  const startedAt = Date.now();
  // `enqueued` counts jobs the sweep had to INSERT — orders the webhook fast
  // path missed. Non-zero feeds the sweep-backlog alert below (M1 / F5).
  const { candidates, enqueued } = await sweepMissedOrders();

  // Drain the due queue: a single 10-job batch would cap throughput at 10
  // jobs/tick and leave any backlog to age until the next one. Keep claiming
  // batches until one comes back short (queue empty) or the drain budget is
  // spent. Claims are atomic per row, so an overlapping webhook kick can
  // never double-run a job we've claimed here. Stopping on budget with jobs
  // still due is itself alert-worthy — it means this cadence can no longer
  // keep up (tracked and reported below).
  const { processed, budgetExhausted: drainBudgetExhausted } =
    await drainDueJobs({
      claimBatch: processDueJobs,
      batchSize: BATCH_SIZE,
      deadlineMs: startedAt + DRAIN_BUDGET_MS,
    });

  await runMaintenance();
  // Stock depletion backstop (Track D · D4b) — re-derives any missed depletion
  // from confirmed-order state. Independent of the integrations outbox above;
  // isolated so its failure can't fail the integrations tick. Failures are
  // LOGGED (not just swallowed): with a daily tick, "surfaces on the next tick"
  // means a full day of silence, so the log line is the only timely signal.
  let depleted = 0;
  try {
    depleted = await sweepStockDepletion();
  } catch (error) {
    console.error("[jobs] stock depletion sweep failed:", error);
    await reportError(error, { context: "jobs-cron.sweep-stock-depletion" });
  }
  // Loyalty earning backstop (PR1) — credits points for any confirmed,
  // loyalty-eligible order missed by the webhook fast-path (e.g. the customer
  // link landed late). Independent + isolated, like the stock sweep above.
  let earned = 0;
  try {
    earned = await sweepLoyaltyEarn();
  } catch (error) {
    console.error("[jobs] loyalty earn sweep failed:", error);
    await reportError(error, { context: "jobs-cron.sweep-loyalty-earn" });
  }
  // Loyalty redemption debit backstop (PR2) — writes the ledger debit for any
  // confirmed order that redeemed points but missed the webhook. Isolated.
  let redeemed = 0;
  try {
    redeemed = await sweepLoyaltyRedeem();
  } catch (error) {
    console.error("[jobs] loyalty redeem sweep failed:", error);
    await reportError(error, { context: "jobs-cron.sweep-loyalty-redeem" });
  }
  // Gift-card redemption debit backstop (PR2) — writes the ledger debit for any
  // confirmed order that redeemed a card but missed the webhook. Isolated.
  let giftCardsRedeemed = 0;
  try {
    giftCardsRedeemed = await sweepGiftCardRedeem();
  } catch (error) {
    console.error("[jobs] gift card redeem sweep failed:", error);
    await reportError(error, { context: "jobs-cron.sweep-gift-card-redeem" });
  }
  // M1 / F5: every sweep is a backstop for work the webhook fast path should
  // already have done, so ANY recovered work — or a drain that ran out of
  // budget — is a warning-level alert event ("sweep_backlog"). A clean tick
  // (all zero, budget not exhausted) reports nothing. No-op without a DSN.
  await reportSweepBacklog({
    integrationJobsEnqueued: enqueued,
    stockDepletionsApplied: depleted,
    loyaltyEarnsApplied: earned,
    loyaltyRedeemsApplied: redeemed,
    giftCardRedeemsApplied: giftCardsRedeemed,
    drainBudgetExhausted,
  });
  return Response.json({
    ok: true,
    swept: candidates,
    sweepEnqueued: enqueued,
    processed,
    drainBudgetExhausted,
    depleted,
    earned,
    redeemed,
    giftCardsRedeemed,
  });
}
