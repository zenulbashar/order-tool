import { and, asc, desc, eq, gt } from "drizzle-orm";

import { db } from "@/lib/db";
import { orders, venueTables } from "@/lib/db/schema";
import { scopedToVenue } from "@/lib/tenant";

/**
 * All dine-in tables for a venue, ordered by sort_order with a created_at
 * tiebreak — used by the onboarding "you're live" step. Venue-scoped.
 */
export async function getTablesForVenue(venueId: string) {
  return db
    .select()
    .from(venueTables)
    .where(scopedToVenue(venueTables.venueId, venueId))
    .orderBy(asc(venueTables.sortOrder), asc(venueTables.createdAt));
}

export type TableStatus = "ordering" | "seated" | "open";

export type TableWithStatus = {
  id: string;
  label: string;
  seats: number | null;
  status: TableStatus;
};

// A table reads as occupied for this long after its last confirmed dine-in
// order; after that it returns to "open".
const OCCUPIED_WINDOW_MS = 2 * 60 * 60 * 1000;

/**
 * All dine-in tables for a venue (sorted), each with a LIVE status derived from
 * confirmed dine-in orders in the last couple of hours:
 *  - `ordering` — the table's latest order is still in the kitchen
 *    (new / preparing / ready);
 *  - `seated` — its latest recent order is completed (served, likely still there);
 *  - `open` — no recent dine-in order.
 * Venue-scoped; read-only.
 */
export async function getTablesWithStatus(
  venueId: string,
): Promise<TableWithStatus[]> {
  const tables = await db
    .select({
      id: venueTables.id,
      label: venueTables.label,
      seats: venueTables.seats,
    })
    .from(venueTables)
    .where(scopedToVenue(venueTables.venueId, venueId))
    .orderBy(asc(venueTables.sortOrder), asc(venueTables.createdAt));

  const since = new Date(new Date().getTime() - OCCUPIED_WINDOW_MS);
  const recent = await db
    .select({
      tableLabel: orders.tableLabel,
      fulfillmentStatus: orders.fulfillmentStatus,
    })
    .from(orders)
    .where(
      and(
        scopedToVenue(orders.venueId, venueId),
        eq(orders.orderType, "dine_in"),
        eq(orders.status, "confirmed"),
        gt(orders.createdAt, since),
      ),
    )
    .orderBy(desc(orders.createdAt));

  // First row per label is the most recent (ordered desc).
  const statusByLabel = new Map<string, TableStatus>();
  for (const order of recent) {
    if (!order.tableLabel) continue;
    const key = order.tableLabel.toLowerCase();
    if (statusByLabel.has(key)) continue;
    const active =
      order.fulfillmentStatus === "new" ||
      order.fulfillmentStatus === "preparing" ||
      order.fulfillmentStatus === "ready";
    statusByLabel.set(key, active ? "ordering" : "seated");
  }

  return tables.map((table) => ({
    ...table,
    status: statusByLabel.get(table.label.toLowerCase()) ?? "open",
  }));
}
