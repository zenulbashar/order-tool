import "server-only";

import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { sweepWatermarks } from "@/lib/db/schema";

/**
 * Reconciliation watermarks for the five cron sweeps (M2 / audit F2).
 *
 * Vercel's cron contract (verified in the audit, §8.4) is: runs get dropped
 * and are never retried, so each run must "reprocess outstanding work since
 * the last SUCCESSFUL run". A fixed lookback window can only reach back a
 * fixed distance — one outage longer than the window and the orders in the
 * gap fall permanently outside every later sweep. The watermark closes that:
 * each sweep anchors its lookback to the last time it ran to completion.
 *
 * Safety properties, in order of importance:
 *  - The fixed 72h window stays as the FLOOR: lookback is never narrower
 *    than today's behaviour, so nothing that works now can regress. The
 *    watermark only ever WIDENS the window, after an outage.
 *  - The anchor subtracts a margin before the watermark because sweeps
 *    filter on `orders.created_at` but eligibility arrives at CONFIRM time —
 *    an order created shortly before a sweep and confirmed after it must
 *    still be inside the next sweep's lookback.
 *  - Reads and writes fail OPEN to the 72h floor (log + carry on): the
 *    watermark table being missing or unreachable must never stop a sweep.
 *  - Advancing uses GREATEST(existing, new), so overlapping ticks (cron +
 *    the opt-in external tick) can never move a watermark backwards.
 *
 * Callers advance the watermark to the sweep's START time, and only when the
 * sweep saw its whole backlog (e.g. the batch cap was not hit) — a capped
 * sweep leaves the watermark alone so the remainder stays inside the next
 * lookback even past the 72h floor.
 */

export type SweepName =
  | "integrations"
  | "stock_depletion"
  | "loyalty_earn"
  | "loyalty_redeem"
  | "gift_card_redeem";

/** Confirm-lag margin: created→confirmed can lag (3DS, wallets, retries). */
const WATERMARK_MARGIN_MS = 24 * 60 * 60 * 1000;

/**
 * Pure lookback decision, unit-tested without a database: the earlier of the
 * fixed floor and (watermark − margin).
 */
export function resolveLookback(options: {
  /** Last successful sweep start, or null when none is recorded. */
  watermark: Date | null;
  floorMs: number;
  nowMs: number;
  marginMs?: number;
}): Date {
  const { watermark, floorMs, nowMs, marginMs = WATERMARK_MARGIN_MS } = options;
  const floor = new Date(nowMs - floorMs);
  if (!watermark) return floor;
  const anchored = new Date(watermark.getTime() - marginMs);
  return anchored < floor ? anchored : floor;
}

/**
 * Where this sweep's scan should start. `floorMs` is the module's
 * SWEEP_WINDOW_MS — passing it keeps the five windows' lockstep rule intact.
 */
export async function sweepLookbackSince(
  name: SweepName,
  floorMs: number,
): Promise<Date> {
  const nowMs = Date.now();
  try {
    const [row] = await db
      .select({ lastSweptAt: sweepWatermarks.lastSweptAt })
      .from(sweepWatermarks)
      .where(eq(sweepWatermarks.name, name))
      .limit(1);
    return resolveLookback({
      watermark: row?.lastSweptAt ?? null,
      floorMs,
      nowMs,
    });
  } catch (error) {
    // Fail open to the floor — a missing/unreachable watermark table must
    // never stop reconciliation (e.g. a tick racing the 0059 migration).
    console.error(`[sweep-watermark] read failed for ${name}:`, error);
    return new Date(nowMs - floorMs);
  }
}

/**
 * Record that the sweep which STARTED at `startedAt` ran to completion.
 * Monotonic upsert; best-effort (a failed write just means the next lookback
 * stays wide, which is safe).
 */
export async function advanceSweepWatermark(
  name: SweepName,
  startedAt: Date,
): Promise<void> {
  try {
    await db
      .insert(sweepWatermarks)
      .values({ name, lastSweptAt: startedAt })
      .onConflictDoUpdate({
        target: sweepWatermarks.name,
        set: {
          lastSweptAt: sql`GREATEST(${sweepWatermarks.lastSweptAt}, excluded.last_swept_at)`,
          updatedAt: new Date(),
        },
      });
  } catch (error) {
    console.error(`[sweep-watermark] advance failed for ${name}:`, error);
  }
}
