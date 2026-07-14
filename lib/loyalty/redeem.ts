import "server-only";

import { and, eq, gt, notExists, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { orders, pointsLedger } from "@/lib/db/schema";

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

const SWEEP_WINDOW_MS = 24 * 60 * 60 * 1000;
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
  const since = new Date(Date.now() - SWEEP_WINDOW_MS);
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
        eq(orders.status, "confirmed"),
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
  return applied;
}
