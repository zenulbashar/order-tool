import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { HOLDING_ORDER_STATUSES } from "@/lib/db/order-status";
import { orders, pointsLedger, pointsLedgerReason } from "@/lib/db/schema";

/**
 * Loyalty balance + activity reads. The balance is ALWAYS derived — SUM of the
 * append-only ledger's deltas — never a stored counter, so it can't drift.
 * Every read is venue + customer scoped (the identity firewall), so one
 * customer can never see another's, nor cross a venue boundary.
 */

export type PointsActivity = {
  id: string;
  deltaPoints: number;
  // Derived from the schema enum so a new ledger reason (e.g. M4's
  // refund_reversal) surfaces here as a compile error, not a blank label.
  reason: (typeof pointsLedgerReason.enumValues)[number];
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
        // Held while the order is retryable OR live-but-not-yet-debited. The
        // points debit lands in a swallowed after() after the status flip, so
        // counting only pending orders left the balance reading as fully
        // available for that window. Unlike gift cards, insertRedeem has no
        // clamp and points_ledger has no non-negative CHECK, so an overspend
        // here renders as a NEGATIVE balance on the customer's account page.
        inArray(orders.status, HOLDING_ORDER_STATUSES),
        // …and the debit has not landed. Once a `redeem` row exists the balance
        // already reflects it; counting the reservation too would double-count.
        sql`not exists (
          select 1 from ${pointsLedger}
           where ${pointsLedger.orderId} = ${orders.id}
             and ${pointsLedger.reason} = 'redeem'
        )`,
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
