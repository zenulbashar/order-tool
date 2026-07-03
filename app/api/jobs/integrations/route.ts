import {
  processDueJobs,
  runMaintenance,
  sweepMissedOrders,
} from "@/lib/integrations/dispatch";
import { sweepStockDepletion } from "@/lib/stock/depletion";

// The dispatch engine uses the Neon pool + node crypto — keep off Edge.
export const runtime = "nodejs";
// Room for a batch of provider calls; well under Vercel's function ceiling.
export const maxDuration = 60;

/** Jobs processed per invocation — bounded so a burst spreads across ticks. */
const BATCH_SIZE = 10;

/**
 * The integrations job processor + sweep (Track 0). Invoked every minute by
 * Vercel Cron (vercel.json), and its logic is also kicked opportunistically
 * after order confirmation via after() in the Stripe webhook. Protected by
 * CRON_SECRET (Vercel sends `Authorization: Bearer <CRON_SECRET>`); if the
 * secret is absent we fail safe and refuse, mirroring the webhook-secret
 * discipline. This route only reads/writes integration outbox state — it can
 * never touch order confirmation.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return new Response("Cron secret is not configured.", { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized.", { status: 401 });
  }

  const swept = await sweepMissedOrders();
  const processed = await processDueJobs(BATCH_SIZE);
  await runMaintenance();
  // Stock depletion backstop (Track D · D4b) — re-derives any missed depletion
  // from confirmed-order state. Independent of the integrations outbox above;
  // isolated so its failure can't fail the integrations tick.
  let depleted = 0;
  try {
    depleted = await sweepStockDepletion();
  } catch {
    // Advisory backstop — surfaces on the next tick.
  }
  return Response.json({ ok: true, swept, processed, depleted });
}
