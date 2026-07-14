import { and, desc, eq, ne, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { orders, pointsLedger } from "@/lib/db/schema";

/**
 * Loyalty balance + activity reads. The balance is ALWAYS derived — SUM of the
 * append-only ledger's deltas — never a stored counter, so it can't drift.
 * Every read is venue + customer scoped (the identity firewall), so one
 * customer can never see another's, nor cross a venue boundary.
 */

export type PointsActivity = {
  id: string;
  deltaPoints: number;
  reason: "earn" | "redeem" | "adjust";
  createdAt: Date;
};

/** Current points balance for a (venue, customer). 0 when there's no history. */
export async function getPointsBalance(
  venueId: string,
  customerId: string,
): Promise<number> {
  const [row] = await db
    .select({
      balance: sql<number>`coalesce(sum(${pointsLedger.deltaPoints}), 0)`,
    })
    .from(pointsLedger)
    .where(
      and(
        eq(pointsLedger.venueId, venueId),
        eq(pointsLedger.customerId, customerId),
      ),
    );
  return Number(row?.balance ?? 0);
}

/**
 * Points a customer can actually redeem RIGHT NOW = their ledger balance minus
 * points already reserved on their OTHER pending orders (a reservation is the
 * `points_redeemed` recorded on a pending order; the matching ledger debit is
 * only written at confirmation). Excludes `excludeOrderId` — the order being
 * recomputed — so re-applying returns its own reservation to the pool first.
 * This keeps a customer from spending the same points across two open carts on
 * the common path; a truly simultaneous double-apply across two orders is an
 * accepted v1 edge (each recompute is serialized only on its own order row).
 */
export async function getAvailablePoints(
  venueId: string,
  customerId: string,
  excludeOrderId: string,
): Promise<number> {
  const balance = await getPointsBalance(venueId, customerId);
  const [row] = await db
    .select({
      reserved: sql<number>`coalesce(sum(${orders.pointsRedeemed}), 0)`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.venueId, venueId),
        eq(orders.customerId, customerId),
        eq(orders.status, "pending_payment"),
        ne(orders.id, excludeOrderId),
      ),
    );
  return Math.max(0, balance - Number(row?.reserved ?? 0));
}

/**
 * Total points outstanding across a whole venue = SUM of every ledger delta
 * (earned − redeemed ± adjusts). Multiplied by the point value, this is the
 * venue's loyalty LIABILITY — points its customers could still redeem. Owner
 * reporting only; not customer-scoped.
 */
export async function getVenuePointsOutstanding(
  venueId: string,
): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${pointsLedger.deltaPoints}), 0)`,
    })
    .from(pointsLedger)
    .where(eq(pointsLedger.venueId, venueId));
  return Math.max(0, Number(row?.total ?? 0));
}

/** Most-recent ledger rows for the account activity list (newest first). */
export async function getPointsActivity(
  venueId: string,
  customerId: string,
  limit = 8,
): Promise<PointsActivity[]> {
  return db
    .select({
      id: pointsLedger.id,
      deltaPoints: pointsLedger.deltaPoints,
      reason: pointsLedger.reason,
      createdAt: pointsLedger.createdAt,
    })
    .from(pointsLedger)
    .where(
      and(
        eq(pointsLedger.venueId, venueId),
        eq(pointsLedger.customerId, customerId),
      ),
    )
    .orderBy(desc(pointsLedger.createdAt))
    .limit(limit);
}
