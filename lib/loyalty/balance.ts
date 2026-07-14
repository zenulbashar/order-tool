import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { pointsLedger } from "@/lib/db/schema";

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
