import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { scopedToVenue } from "@/lib/tenant";

/**
 * Owner customer directory (Square parity, quick-win #3) — FIREWALL-SAFE.
 *
 * Aggregated ENTIRELY from the owner's OWN venue's confirmed orders. We never
 * join or read the diner `customers` auth table (no email, no cross-venue
 * correlation): the grouping key is a three-tier coalesce of columns already on
 * the order row — `customerId` (an opaque in-venue bucket label, never
 * dereferenced) → normalized phone → lowercased name. Every read is wrapped in
 * scopedToVenue, so no other venue's rows are ever touched.
 */

const NEW_WINDOW_DAYS = 30;

export type VenueCustomer = {
  key: string;
  name: string;
  phone: string | null;
  orders: number;
  totalCents: number;
  avgCents: number;
  firstOrderAt: Date;
  lastOrderAt: Date;
};

export type VenueCustomerStats = {
  customers: VenueCustomer[]; // sorted by total spend, desc
  totalCustomers: number;
  repeatCount: number; // customers with more than one order
  orderCount: number;
  totalRevenueCents: number;
  avgSpendCents: number; // per customer
  avgOrderCents: number; // per order
  newThisPeriod: number; // first order within NEW_WINDOW_DAYS
};

/** Digits only; null when nothing usable remains. */
function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

type Agg = {
  key: string;
  name: string;
  phone: string | null;
  orders: number;
  totalCents: number;
  firstOrderAt: Date;
  lastOrderAt: Date;
  nameSeenAt: number; // createdAt of the chosen display name
  phoneSeenAt: number; // createdAt of the chosen display phone
};

export async function getVenueCustomers(
  venueId: string,
): Promise<VenueCustomerStats> {
  const rows = await db
    .select({
      customerId: orders.customerId,
      customerName: orders.customerName,
      customerPhone: orders.customerPhone,
      totalCents: orders.totalCents,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(
      and(
        scopedToVenue(orders.venueId, venueId),
        eq(orders.status, "confirmed"),
      ),
    );

  const map = new Map<string, Agg>();
  for (const row of rows) {
    const phone = normalizePhone(row.customerPhone);
    const key = row.customerId
      ? `id:${row.customerId}`
      : phone
        ? `phone:${phone}`
        : `name:${row.customerName.trim().toLowerCase()}`;
    const at = row.createdAt.getTime();

    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        key,
        name: row.customerName,
        phone: row.customerPhone,
        orders: 1,
        totalCents: row.totalCents,
        firstOrderAt: row.createdAt,
        lastOrderAt: row.createdAt,
        nameSeenAt: at,
        phoneSeenAt: row.customerPhone ? at : -1,
      });
      continue;
    }
    existing.orders += 1;
    existing.totalCents += row.totalCents;
    if (row.createdAt < existing.firstOrderAt) existing.firstOrderAt = row.createdAt;
    if (row.createdAt > existing.lastOrderAt) existing.lastOrderAt = row.createdAt;
    // Prefer the display name/phone from the most recent order that has one.
    if (at >= existing.nameSeenAt && row.customerName.trim()) {
      existing.name = row.customerName;
      existing.nameSeenAt = at;
    }
    if (row.customerPhone && at >= existing.phoneSeenAt) {
      existing.phone = row.customerPhone;
      existing.phoneSeenAt = at;
    }
  }

  const customers: VenueCustomer[] = [...map.values()]
    .map((a) => ({
      key: a.key,
      name: a.name,
      phone: a.phone,
      orders: a.orders,
      totalCents: a.totalCents,
      avgCents: Math.round(a.totalCents / a.orders),
      firstOrderAt: a.firstOrderAt,
      lastOrderAt: a.lastOrderAt,
    }))
    .sort((x, y) => y.totalCents - x.totalCents);

  const totalCustomers = customers.length;
  const orderCount = rows.length;
  const totalRevenueCents = customers.reduce((sum, c) => sum + c.totalCents, 0);
  const since = new Date().getTime() - NEW_WINDOW_DAYS * 86_400_000;

  return {
    customers,
    totalCustomers,
    repeatCount: customers.filter((c) => c.orders > 1).length,
    orderCount,
    totalRevenueCents,
    avgSpendCents: totalCustomers > 0 ? Math.round(totalRevenueCents / totalCustomers) : 0,
    avgOrderCents: orderCount > 0 ? Math.round(totalRevenueCents / orderCount) : 0,
    newThisPeriod: customers.filter((c) => c.firstOrderAt.getTime() >= since).length,
  };
}
