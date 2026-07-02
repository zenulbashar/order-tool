import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { orderItemModifiers, orderItems, orders } from "@/lib/db/schema";
import { scopedToVenue } from "@/lib/tenant";

import type { CustomerOrderSummary, CustomerUsual } from "./types";

/** Most recent orders shown in a customer's history. */
const HISTORY_LIMIT = 25;

/** An order must repeat at least this often to qualify as "your usual". */
const USUAL_MIN_COUNT = 2;

/**
 * A customer's own order history — IDOR-safe by construction: filtered by
 * venue_id AND customer_id, where customerId is the SESSION-derived customer
 * (never a client-supplied value), so a customer can only ever read their own
 * orders. There is no order id or token in the request path, so nothing is
 * enumerable. Everything shown comes from the immutable snapshot columns.
 */
export async function getCustomerOrders(
  venueId: string,
  customerId: string,
): Promise<CustomerOrderSummary[]> {
  const orderRows = await db
    .select({
      id: orders.id,
      publicToken: orders.publicToken,
      status: orders.status,
      orderType: orders.orderType,
      totalCents: orders.totalCents,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(
      and(
        scopedToVenue(orders.venueId, venueId),
        eq(orders.customerId, customerId),
      ),
    )
    .orderBy(desc(orders.createdAt))
    .limit(HISTORY_LIMIT);
  if (orderRows.length === 0) return [];

  const ids = orderRows.map((order) => order.id);
  const itemRows = await db
    .select({
      orderId: orderItems.orderId,
      name: orderItems.itemNameSnapshot,
      variantName: orderItems.variantNameSnapshot,
      quantity: orderItems.quantity,
    })
    .from(orderItems)
    .where(
      and(
        inArray(orderItems.orderId, ids),
        scopedToVenue(orderItems.venueId, venueId),
      ),
    )
    .orderBy(asc(orderItems.createdAt));

  const itemsByOrder = new Map<string, typeof itemRows>();
  for (const item of itemRows) {
    const list = itemsByOrder.get(item.orderId) ?? [];
    list.push(item);
    itemsByOrder.set(item.orderId, list);
  }

  return orderRows.map((order) => {
    const items = itemsByOrder.get(order.id) ?? [];
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
    const itemSummary = items
      .map(
        (item) =>
          `${item.quantity}× ${item.name}${item.variantName ? ` (${item.variantName})` : ""}`,
      )
      .join(", ");
    return {
      publicToken: order.publicToken,
      status: order.status,
      orderType: order.orderType,
      totalCents: order.totalCents,
      createdAt: order.createdAt,
      itemCount,
      itemSummary,
    };
  });
}

/**
 * The customer's most-repeated identical order (the "YOUR USUAL" hero).
 * IDOR-safe by the SAME construction as getCustomerOrders — filtered by
 * venue_id AND the SESSION-derived customer_id — and restricted to CONFIRMED
 * (paid) orders so an abandoned or cancelled attempt never counts.
 *
 * Each recent order is fingerprinted by its soft-ref ids (item / variant /
 * sorted option ids / quantity, lines sorted) — the same ids the reorder
 * action seeds — so "identical" means "would rebuild the same cart". Orders
 * containing a deleted item (null menu_item_id) are skipped: they can't be
 * reordered faithfully. Display-only: no pricing, no writes; reorder goes
 * through the existing ids-only action via the newest matching order's token
 * and re-prices live through placeOrder.
 */
export async function getCustomerUsual(
  venueId: string,
  customerId: string,
): Promise<CustomerUsual | null> {
  const orderRows = await db
    .select({
      id: orders.id,
      publicToken: orders.publicToken,
      totalCents: orders.totalCents,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(
      and(
        scopedToVenue(orders.venueId, venueId),
        eq(orders.customerId, customerId),
        eq(orders.status, "confirmed"),
      ),
    )
    .orderBy(desc(orders.createdAt))
    .limit(HISTORY_LIMIT);
  if (orderRows.length < USUAL_MIN_COUNT) return null;

  const ids = orderRows.map((order) => order.id);
  const itemRows = await db
    .select({
      id: orderItems.id,
      orderId: orderItems.orderId,
      menuItemId: orderItems.menuItemId,
      menuItemVariantId: orderItems.menuItemVariantId,
      quantity: orderItems.quantity,
      name: orderItems.itemNameSnapshot,
      variantName: orderItems.variantNameSnapshot,
    })
    .from(orderItems)
    .where(
      and(
        inArray(orderItems.orderId, ids),
        scopedToVenue(orderItems.venueId, venueId),
      ),
    )
    .orderBy(asc(orderItems.createdAt));

  const itemIds = itemRows.map((item) => item.id);
  const modifierRows = itemIds.length
    ? await db
        .select({
          orderItemId: orderItemModifiers.orderItemId,
          modifierOptionId: orderItemModifiers.modifierOptionId,
        })
        .from(orderItemModifiers)
        .where(
          and(
            inArray(orderItemModifiers.orderItemId, itemIds),
            scopedToVenue(orderItemModifiers.venueId, venueId),
          ),
        )
    : [];

  // Null option ids (deleted modifiers) are dropped, mirroring reorder():
  // the seeded line simply omits them.
  const optionsByItem = new Map<string, string[]>();
  for (const modifier of modifierRows) {
    if (!modifier.modifierOptionId) continue;
    const list = optionsByItem.get(modifier.orderItemId) ?? [];
    list.push(modifier.modifierOptionId);
    optionsByItem.set(modifier.orderItemId, list);
  }

  const itemsByOrder = new Map<string, typeof itemRows>();
  for (const item of itemRows) {
    const list = itemsByOrder.get(item.orderId) ?? [];
    list.push(item);
    itemsByOrder.set(item.orderId, list);
  }

  // orderRows are newest-first, so the first order seen for a fingerprint is
  // its newest (the representative), and on a count tie the smaller newestIndex
  // wins (most recent usual).
  const groups = new Map<string, { count: number; newestIndex: number }>();
  for (let index = 0; index < orderRows.length; index++) {
    const items = itemsByOrder.get(orderRows[index].id) ?? [];
    if (items.length === 0) continue;
    if (items.some((item) => !item.menuItemId)) continue;
    const lineKeys = items.map((item) =>
      JSON.stringify([
        item.menuItemId,
        item.menuItemVariantId,
        [...(optionsByItem.get(item.id) ?? [])].sort(),
        item.quantity,
      ]),
    );
    lineKeys.sort();
    const fingerprint = lineKeys.join("\n");
    const group = groups.get(fingerprint);
    if (group) group.count += 1;
    else groups.set(fingerprint, { count: 1, newestIndex: index });
  }

  let winner: { count: number; newestIndex: number } | null = null;
  for (const group of groups.values()) {
    if (
      !winner ||
      group.count > winner.count ||
      (group.count === winner.count && group.newestIndex < winner.newestIndex)
    ) {
      winner = group;
    }
  }
  if (!winner || winner.count < USUAL_MIN_COUNT) return null;

  const representative = orderRows[winner.newestIndex];
  const title = (itemsByOrder.get(representative.id) ?? [])
    .map(
      (item) =>
        `${item.quantity > 1 ? `${item.quantity}× ` : ""}${item.name}${item.variantName ? ` (${item.variantName})` : ""}`,
    )
    .join(" + ");

  return {
    title,
    count: winner.count,
    totalCents: representative.totalCents,
    publicToken: representative.publicToken,
  };
}
