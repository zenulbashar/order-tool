import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { orderItemModifiers, orderItems, orders } from "@/lib/db/schema";
import { scopedToVenue } from "@/lib/tenant";

import type {
  CustomerOrderSummary,
  RecentCustomerOrder,
  RecentOrderItem,
} from "./types";

/** Most recent orders shown in a customer's history. */
const HISTORY_LIMIT = 25;

/** How many recent orders surface as quick-reorder "favourite" cards. */
const RECENT_LIMIT = 3;

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
 * The customer's most recent orders in FULL detail (each line's add-ons + the
 * order notes) for the quick-reorder "favourite" cards. IDOR-safe by the SAME
 * construction as getCustomerOrders — filtered by venue_id AND the SESSION-
 * derived customer_id (never client input), reading only immutable snapshot
 * columns. Display-only: no pricing, no writes. Reorder seeds ids-only and
 * re-prices live through placeOrder, exactly like the history list.
 */
export async function getRecentCustomerOrders(
  venueId: string,
  customerId: string,
  limit: number = RECENT_LIMIT,
): Promise<RecentCustomerOrder[]> {
  const orderRows = await db
    .select({
      id: orders.id,
      publicToken: orders.publicToken,
      status: orders.status,
      orderType: orders.orderType,
      totalCents: orders.totalCents,
      createdAt: orders.createdAt,
      notes: orders.notes,
    })
    .from(orders)
    .where(
      and(
        scopedToVenue(orders.venueId, venueId),
        eq(orders.customerId, customerId),
      ),
    )
    .orderBy(desc(orders.createdAt))
    .limit(limit);
  if (orderRows.length === 0) return [];

  const ids = orderRows.map((order) => order.id);
  const itemRows = await db
    .select({
      id: orderItems.id,
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

  const itemIds = itemRows.map((item) => item.id);
  const modifierRows = itemIds.length
    ? await db
        .select({
          orderItemId: orderItemModifiers.orderItemId,
          name: orderItemModifiers.nameSnapshot,
        })
        .from(orderItemModifiers)
        .where(
          and(
            inArray(orderItemModifiers.orderItemId, itemIds),
            scopedToVenue(orderItemModifiers.venueId, venueId),
          ),
        )
    : [];

  const modNamesByItem = new Map<string, string[]>();
  for (const mod of modifierRows) {
    const list = modNamesByItem.get(mod.orderItemId) ?? [];
    list.push(mod.name);
    modNamesByItem.set(mod.orderItemId, list);
  }

  const itemsByOrder = new Map<string, RecentOrderItem[]>();
  for (const item of itemRows) {
    const list = itemsByOrder.get(item.orderId) ?? [];
    list.push({
      name: item.name,
      variantName: item.variantName,
      quantity: item.quantity,
      modifierNames: modNamesByItem.get(item.id) ?? [],
    });
    itemsByOrder.set(item.orderId, list);
  }

  return orderRows.map((order) => ({
    publicToken: order.publicToken,
    status: order.status,
    orderType: order.orderType,
    totalCents: order.totalCents,
    createdAt: order.createdAt,
    notes: order.notes,
    items: itemsByOrder.get(order.id) ?? [],
  }));
}
