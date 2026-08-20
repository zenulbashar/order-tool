import { and, asc, desc, eq, gt, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { ACTIVE_ORDER_STATUSES } from "@/lib/db/order-status";
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

/**
 * Recent dine-in orders at a table LABEL (null when there are none).
 *
 * Called a "session" until it was noticed that no such thing exists. There is
 * no close-table control, no party lifecycle, and no boundary of any kind —
 * this is every active dine-in order carrying this label in the last two hours,
 * and nothing more. A party that leaves at 13:00 having spent $80 and a new
 * party seated at 13:30 are one bucket, so the board showed the NEW party's
 * order reference beside BOTH parties' money.
 *
 * A dwell-gap heuristic was the obvious fix and is not the one taken: it would
 * invent a party boundary the product has no concept of, and be confidently
 * wrong on a table that orders drinks, waits forty minutes, then orders mains.
 * The data honestly supports "orders at this label in the last 2h", so that is
 * what the type and the UI now say. Prepay model, so nothing is owed either way
 * — this is an accuracy problem, not a money one.
 */
export type TableRecentOrders = {
  /** Reference of the most recent order. Meaningful ALONE; see totalCents. */
  latestOrderRef: string;
  /** When that most recent order was placed. */
  latestPlacedAt: Date;
  /**
   * Combined spend across ALL of them. Deliberately not presented next to
   * latestOrderRef when orderCount > 1 — that pairing is what read as "this
   * order's party spent this much".
   */
  totalCents: number;
  /** How many orders that spend covers. */
  orderCount: number;
};

export type TableWithStatus = {
  id: string;
  label: string;
  seats: number | null;
  status: TableStatus;
  recent: TableRecentOrders | null;
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
        inArray(orders.status, ACTIVE_ORDER_STATUSES),
        gt(orders.createdAt, since),
      ),
    )
    .orderBy(desc(orders.createdAt));

  // Aggregate per table label. The FIRST row seen per label is the most recent
  // (ordered desc) and sets the status + session head; later rows of the same
  // label add to the combined session spend + count.
  type Agg = {
    status: TableStatus;
    recent: TableRecentOrders;
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
        recent: {
          latestOrderRef: orderReference(order.publicToken),
          latestPlacedAt: order.createdAt,
          totalCents: order.totalCents,
          orderCount: 1,
        },
      });
    } else {
      existing.recent.totalCents += order.totalCents;
      existing.recent.orderCount += 1;
    }
  }

  return tables.map((table) => {
    const agg = byLabel.get(table.label.toLowerCase());
    return {
      ...table,
      status: agg?.status ?? "open",
      recent: agg?.recent ?? null,
    };
  });
}
