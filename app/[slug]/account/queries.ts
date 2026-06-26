import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { orderItems, orders } from "@/lib/db/schema";
import { scopedToVenue } from "@/lib/tenant";

import type { CustomerOrderSummary } from "./types";

/** Most recent orders shown in a customer's history. */
const HISTORY_LIMIT = 25;

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
