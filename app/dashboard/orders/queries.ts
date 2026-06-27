import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { orderItemModifiers, orderItems, orders } from "@/lib/db/schema";
import { scopedToVenue } from "@/lib/tenant";

export type FulfillmentStatus = "new" | "preparing" | "ready" | "completed";

export type KitchenOrderModifier = {
  id: string;
  name: string;
  priceDeltaCents: number;
};

export type KitchenOrderItem = {
  id: string;
  name: string;
  // Chosen size for a variant-priced line (snapshot), else null.
  variantName: string | null;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  modifiers: KitchenOrderModifier[];
};

export type KitchenOrder = {
  id: string;
  publicToken: string;
  orderType: "pickup" | "dine_in";
  tableLabel: string | null;
  customerName: string;
  customerPhone: string | null;
  // Optional customer special request (e.g. "no onion"); rendered as plain text.
  notes: string | null;
  fulfillmentStatus: FulfillmentStatus;
  subtotalCents: number;
  totalCents: number;
  createdAt: Date;
  items: KitchenOrderItem[];
};

/** Fulfillment statuses that belong in the live (active) kitchen queue. */
const ACTIVE_FULFILLMENT: FulfillmentStatus[] = ["new", "preparing", "ready"];

/**
 * Venue-scoped kitchen queue. Returns ONLY paid orders (status='confirmed') —
 * an unpaid order is not a kitchen order, so pending_payment / payment_failed /
 * cancelled never appear. By default returns the ACTIVE orders
 * (fulfillment_status new/preparing/ready) OLDEST-FIRST (FIFO: the kitchen works
 * the oldest order first); pass { completed: true } for the completed history,
 * newest-first. Every line of detail comes from the immutable order snapshots,
 * never a live menu re-join — the same immutability principle as the customer
 * confirmation page. venue_id scopes every query, so one venue can never read
 * another's orders.
 */
export async function getVenueOrders(
  venueId: string,
  options?: { completed?: boolean },
): Promise<KitchenOrder[]> {
  const completed = options?.completed ?? false;

  const orderRows = await db
    .select({
      id: orders.id,
      publicToken: orders.publicToken,
      orderType: orders.orderType,
      tableLabel: orders.tableLabel,
      customerName: orders.customerName,
      customerPhone: orders.customerPhone,
      notes: orders.notes,
      fulfillmentStatus: orders.fulfillmentStatus,
      subtotalCents: orders.subtotalCents,
      totalCents: orders.totalCents,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(
      and(
        scopedToVenue(orders.venueId, venueId),
        eq(orders.status, "confirmed"),
        completed
          ? eq(orders.fulfillmentStatus, "completed")
          : inArray(orders.fulfillmentStatus, ACTIVE_FULFILLMENT),
      ),
    )
    .orderBy(completed ? desc(orders.createdAt) : asc(orders.createdAt));

  if (orderRows.length === 0) return [];

  // Snapshot lines for exactly these orders, venue-scoped. One query for all
  // orders' items, one for all their modifiers — independent of order count.
  const orderIds = orderRows.map((order) => order.id);
  const itemRows = await db
    .select({
      id: orderItems.id,
      orderId: orderItems.orderId,
      name: orderItems.itemNameSnapshot,
      variantName: orderItems.variantNameSnapshot,
      quantity: orderItems.quantity,
      unitPriceCents: orderItems.unitPriceCentsSnapshot,
      lineTotalCents: orderItems.lineTotalCents,
    })
    .from(orderItems)
    .where(
      and(
        inArray(orderItems.orderId, orderIds),
        scopedToVenue(orderItems.venueId, venueId),
      ),
    )
    .orderBy(asc(orderItems.createdAt));

  const itemIds = itemRows.map((item) => item.id);
  const modifierRows = itemIds.length
    ? await db
        .select({
          id: orderItemModifiers.id,
          orderItemId: orderItemModifiers.orderItemId,
          name: orderItemModifiers.nameSnapshot,
          priceDeltaCents: orderItemModifiers.priceDeltaCentsSnapshot,
        })
        .from(orderItemModifiers)
        .where(
          and(
            inArray(orderItemModifiers.orderItemId, itemIds),
            scopedToVenue(orderItemModifiers.venueId, venueId),
          ),
        )
    : [];

  const modsByItem = new Map<string, KitchenOrderModifier[]>();
  for (const mod of modifierRows) {
    const list = modsByItem.get(mod.orderItemId) ?? [];
    list.push({
      id: mod.id,
      name: mod.name,
      priceDeltaCents: mod.priceDeltaCents,
    });
    modsByItem.set(mod.orderItemId, list);
  }

  const itemsByOrder = new Map<string, KitchenOrderItem[]>();
  for (const item of itemRows) {
    const list = itemsByOrder.get(item.orderId) ?? [];
    list.push({
      id: item.id,
      name: item.name,
      variantName: item.variantName,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      lineTotalCents: item.lineTotalCents,
      modifiers: modsByItem.get(item.id) ?? [],
    });
    itemsByOrder.set(item.orderId, list);
  }

  return orderRows.map((order) => ({
    id: order.id,
    publicToken: order.publicToken,
    orderType: order.orderType,
    tableLabel: order.tableLabel,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    notes: order.notes,
    fulfillmentStatus: order.fulfillmentStatus,
    subtotalCents: order.subtotalCents,
    totalCents: order.totalCents,
    createdAt: order.createdAt,
    items: itemsByOrder.get(order.id) ?? [],
  }));
}
