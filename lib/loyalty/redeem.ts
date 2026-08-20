import "server-only";

import { and, eq, gt, inArray, notExists, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { ACTIVE_ORDER_STATUSES } from "@/lib/db/order-status";
import { orders, pointsLedger } from "@/lib/db/schema";
import { advanceSweepWatermark, sweepLookbackSince } from "@/lib/sweep-watermark";

/**
 * Loyalty points REDEMPTION debit (Loyalty PR2). The DISCOUNT itself is applied
 * pre-payment by applyOrderDiscounts (which records `orders.points_redeemed` as
 * a reservation and lowers the charge); this writes the matching ledger DEBIT
 * once the order is actually confirmed — so points only leave the balance when
 * the customer has paid, and an abandoned order's reservation simply lapses.
 *
 * Same contract as earning: called only AFTER confirmation, isolated by the
 * webhook's own try/catch or run by the cron sweep, and idempotent via the
 * ledger's unique(order_id, reason) index — replays/overlaps can't double-debit.
 */

/**
 * 72h — must exceed the worst-case gap between successful daily cron runs
 * (Vercel cron never retries a failed run, and runs jitter within the hour), or
 * orders in a missed run's gap are permanently skipped. See the rationale on
 * lib/integrations/dispatch.ts SWEEP_WINDOW_MS; keep all five in lockstep.
 */
const SWEEP_WINDOW_MS = 72 * 60 * 60 * 1000;
const SWEEP_BATCH = 100;

async function insertRedeem(row: {
  id: string;
  venueId: string;
  customerId: string;
  pointsRedeemed: number;
}): Promise<number> {
  if (row.pointsRedeemed <= 0) return 0;
  const inserted = await db
    .insert(pointsLedger)
    .values({
      venueId: row.venueId,
      customerId: row.customerId,
      orderId: row.id,
      deltaPoints: -row.pointsRedeemed, // redemption = points out
      reason: "redeem",
    })
    .onConflictDoNothing()
    .returning({ id: pointsLedger.id });
  return inserted.length > 0 ? row.pointsRedeemed : 0;
}

/**
 * Fast-path entry from the Stripe webhook: debit the points a confirmed order
 * redeemed. No-op unless the order is confirmed, linked to a customer, and
 * actually redeemed points. Returns points debited (0 = nothing to do).
 */
export async function redeemPointsForOrder(
  paymentIntentId: string,
): Promise<number> {
  const [order] = await db
    .select({
      id: orders.id,
      venueId: orders.venueId,
      customerId: orders.customerId,
      pointsRedeemed: orders.pointsRedeemed,
    })
    .from(orders)
    .where(
      and(
        eq(orders.stripePaymentIntentId, paymentIntentId),
        eq(orders.status, "confirmed"),
      ),
    )
    .limit(1);

  if (!order || !order.customerId || order.pointsRedeemed <= 0) return 0;
  return insertRedeem({
    id: order.id,
    venueId: order.venueId,
    customerId: order.customerId,
    pointsRedeemed: order.pointsRedeemed,
  });
}

/**
 * Cron backstop: debit any recently-confirmed order that redeemed points but
 * has no `redeem` ledger row yet — the guarantee that makes the webhook debit a
 * latency optimization only. Bounded; idempotent so the next tick continues.
 */
export async function sweepLoyaltyRedeem(): Promise<number> {
  const startedAt = new Date();
  // Anchored to the last SUCCESSFUL sweep (M2) — the 72h window is the floor,
  // an outage longer than it widens the lookback instead of orphaning orders.
  const since = await sweepLookbackSince("loyalty_redeem", SWEEP_WINDOW_MS);
  const pending = await db
    .select({
      id: orders.id,
      venueId: orders.venueId,
      customerId: orders.customerId,
      pointsRedeemed: orders.pointsRedeemed,
    })
    .from(orders)
    .where(
      and(
        // Same reasoning as the gift-card redeem sweep: `partially_refunded`
        // still owes the debit (the points bought food the diner kept), and
        // `refunded` must NOT be debited — reverseLoyalty reads this ledger, so
        // on a full refund it already found nothing to reverse, and a late debit
        // would take points nothing will hand back.
        inArray(orders.status, ACTIVE_ORDER_STATUSES),
        gt(orders.createdAt, since),
        gt(orders.pointsRedeemed, 0),
        notExists(
          db
            .select({ one: sql`1` })
            .from(pointsLedger)
            .where(
              and(
                eq(pointsLedger.orderId, orders.id),
                eq(pointsLedger.reason, "redeem"),
              ),
            ),
        ),
      ),
    )
    .limit(SWEEP_BATCH);

  let applied = 0;
  for (const row of pending) {
    if (!row.customerId) continue;
    try {
      const n = await insertRedeem({
        id: row.id,
        venueId: row.venueId,
        customerId: row.customerId,
        pointsRedeemed: row.pointsRedeemed,
      });
      if (n > 0) applied += 1;
    } catch {
      // A single order's debit failure must not abort the sweep.
    }
  }
  // Advance the watermark only when this sweep saw its WHOLE backlog — a
  // batch-capped tick leaves it alone so the remainder stays inside the next
  // lookback even past the 72h floor.
  if (pending.length < SWEEP_BATCH) {
    await advanceSweepWatermark("loyalty_redeem", startedAt);
  }
  return applied;
}
