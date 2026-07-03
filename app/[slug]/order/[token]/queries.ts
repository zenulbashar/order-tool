import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { orderItemModifiers, orderItems, orders } from "@/lib/db/schema";
import { scopedToVenue } from "@/lib/tenant";

export type ConfirmedOrderItem = {
  id: string;
  name: string;
  // Chosen size for a variant-priced line (snapshot), else null.
  variantName: string | null;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  modifiers: { id: string; name: string; priceDeltaCents: number }[];
};

export type ConfirmedOrder = {
  publicToken: string;
  status: "pending_payment" | "confirmed" | "cancelled" | "payment_failed";
  // Kitchen lifecycle, separate from `status` (payment). Read-only here — drives
  // the diner's Placed → Preparing → Ready tracker once the order is paid; the
  // owner board is the only writer.
  fulfillmentStatus: "new" | "preparing" | "ready" | "completed";
  orderType: "pickup" | "dine_in";
  tableLabel: string | null;
  // Absolute pickup instant for scheduled pickups; null for ASAP / dine-in.
  scheduledFor: Date | null;
  customerName: string;
  // Optional customer special request; rendered as plain (escaped) text.
  notes: string | null;
  subtotalCents: number;
  // Pay-by-bank saving applied to this order (Track B · 3b-ii); 0 when none.
  discountCents: number;
  totalCents: number;
  createdAt: Date;
  items: ConfirmedOrderItem[];
};

/**
 * Resolve an order by its opaque public_token AND the venue it belongs to.
 * Never resolves by sequential id, so order ids can't be enumerated. Everything
 * shown comes from the immutable snapshot columns, not the live menu.
 */
export async function getOrderByToken(
  venueId: string,
  token: string,
): Promise<ConfirmedOrder | null> {
  const trimmed = token.trim();
  if (trimmed.length === 0) return null;

  const [order] = await db
    .select({
      id: orders.id,
      publicToken: orders.publicToken,
      status: orders.status,
      fulfillmentStatus: orders.fulfillmentStatus,
      orderType: orders.orderType,
      tableLabel: orders.tableLabel,
      scheduledFor: orders.scheduledFor,
      customerName: orders.customerName,
      notes: orders.notes,
      subtotalCents: orders.subtotalCents,
      discountCents: orders.discountCents,
      totalCents: orders.totalCents,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(
      and(
        eq(orders.publicToken, trimmed),
        scopedToVenue(orders.venueId, venueId),
      ),
    )
    .limit(1);
  if (!order) return null;

  const items = await db
    .select({
      id: orderItems.id,
      name: orderItems.itemNameSnapshot,
      variantName: orderItems.variantNameSnapshot,
      quantity: orderItems.quantity,
      unitPriceCents: orderItems.unitPriceCentsSnapshot,
      lineTotalCents: orderItems.lineTotalCents,
    })
    .from(orderItems)
    .where(
      and(
        eq(orderItems.orderId, order.id),
        scopedToVenue(orderItems.venueId, venueId),
      ),
    )
    .orderBy(asc(orderItems.createdAt));

  const itemIds = items.map((item) => item.id);
  const modifiers = itemIds.length
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
  const modsByItem = new Map<string, typeof modifiers>();
  for (const modifier of modifiers) {
    const list = modsByItem.get(modifier.orderItemId) ?? [];
    list.push(modifier);
    modsByItem.set(modifier.orderItemId, list);
  }

  return {
    publicToken: order.publicToken,
    status: order.status,
    fulfillmentStatus: order.fulfillmentStatus,
    orderType: order.orderType,
    tableLabel: order.tableLabel,
    scheduledFor: order.scheduledFor,
    customerName: order.customerName,
    notes: order.notes,
    subtotalCents: order.subtotalCents,
    discountCents: order.discountCents,
    totalCents: order.totalCents,
    createdAt: order.createdAt,
    items: items.map((item) => ({
      id: item.id,
      name: item.name,
      variantName: item.variantName,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      lineTotalCents: item.lineTotalCents,
      modifiers: (modsByItem.get(item.id) ?? []).map((modifier) => ({
        id: modifier.id,
        name: modifier.name,
        priceDeltaCents: modifier.priceDeltaCents,
      })),
    })),
  };
}
