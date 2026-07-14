import { and, asc, desc, eq, gt } from "drizzle-orm";

import { db } from "@/lib/db";
import { orders, venueTables } from "@/lib/db/schema";
import { scopedToVenue } from "@/lib/tenant";
import { orderReference } from "@/lib/validation";

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

/** The live dine-in session at an occupied table (null when the table is open). */
export type TableSession = {
  /** Reference of the table's most recent recent order. */
  orderRef: string;
  /** When that most recent order was placed. */
  placedAt: Date;
  /** Combined spend across the table's recent confirmed dine-in orders. */
  totalCents: number;
  /** How many recent orders that spend covers. */
  orderCount: number;
};

export type TableWithStatus = {
  id: string;
  label: string;
  seats: number | null;
  status: TableStatus;
  session: TableSession | null;
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
      publicToken: orders.publicToken,
      totalCents: orders.totalCents,
      createdAt: orders.createdAt,
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

  // Aggregate per table label. The FIRST row seen per label is the most recent
  // (ordered desc) and sets the status + session head; later rows of the same
  // label add to the combined session spend + count.
  type Agg = {
    status: TableStatus;
    session: TableSession;
  };
  const byLabel = new Map<string, Agg>();
  for (const order of recent) {
    if (!order.tableLabel) continue;
    const key = order.tableLabel.toLowerCase();
    const existing = byLabel.get(key);
    if (!existing) {
      const active =
        order.fulfillmentStatus === "new" ||
        order.fulfillmentStatus === "preparing" ||
        order.fulfillmentStatus === "ready";
      byLabel.set(key, {
        status: active ? "ordering" : "seated",
        session: {
          orderRef: orderReference(order.publicToken),
          placedAt: order.createdAt,
          totalCents: order.totalCents,
          orderCount: 1,
        },
      });
    } else {
      existing.session.totalCents += order.totalCents;
      existing.session.orderCount += 1;
    }
  }

  return tables.map((table) => {
    const agg = byLabel.get(table.label.toLowerCase());
    return {
      ...table,
      status: agg?.status ?? "open",
      session: agg?.session ?? null,
    };
  });
}
