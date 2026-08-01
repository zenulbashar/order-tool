"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import {
  refundedCentsForOrder,
  refundOrder,
} from "@/lib/payments/refund-service";
import { remainingRefundableCents } from "@/lib/payments/refund";
import { requireUser, requireVenuePermission, scopedToVenue } from "@/lib/tenant";
import { idSchema } from "@/lib/validation";
import { and, eq } from "drizzle-orm";

const ORDERS_PATH = "/dashboard/orders";

export type RefundActionResult = { ok?: true; error?: string };

/**
 * Refund an order from the kitchen dashboard (M4 / audit F3).
 *
 * Server Functions are reachable via direct POST, so auth is re-checked here
 * and the venue is resolved server-side; the order is looked up scoped to
 * THAT venue inside refundOrder(), so a forged order id from another tenant
 * moves no money. The amount is parsed from the form but is always
 * re-validated against the order's own total server-side — the client can
 * never widen what it is allowed to refund.
 *
 * Leaving the amount blank refunds everything still outstanding, which is
 * the common case and avoids the UI having to compute a remainder.
 */
export async function refundOrderAction(
  formData: FormData,
): Promise<RefundActionResult> {
  const user = await requireUser();
  const venue = await requireVenuePermission("refunds:issue");

  const id = idSchema.safeParse(formData.get("orderId"));
  if (!id.success) return { error: "Missing order." };

  const rawAmount = String(formData.get("amount") ?? "").trim();
  let amountCents: number | null = null;
  if (rawAmount !== "") {
    // Dollars in the form; cents everywhere behind it.
    const dollars = Number(rawAmount);
    if (!Number.isFinite(dollars) || dollars <= 0) {
      return { error: "Enter a refund amount greater than zero." };
    }
    amountCents = Math.round(dollars * 100);
  }

  const result = await refundOrder({
    orderId: id.data,
    venueId: venue.id,
    actorUserId: user.id ?? null,
    amountCents,
    reason: formData.get("reason"),
    note: String(formData.get("note") ?? ""),
  });

  revalidatePath(ORDERS_PATH);
  if (!result.ok) return { error: result.error };
  return { ok: true };
}

export type OrderRefundSummary = {
  totalCents: number;
  refundedCents: number;
  remainingCents: number;
  status: string;
};

/** Refund state for one order, venue-scoped. Null when not this venue's. */
export async function getOrderRefundSummary(
  orderId: string,
): Promise<OrderRefundSummary | null> {
  await requireUser();
  const venue = await requireVenuePermission("refunds:issue");

  const parsed = idSchema.safeParse(orderId);
  if (!parsed.success) return null;

  const [order] = await db
    .select({ totalCents: orders.totalCents, status: orders.status })
    .from(orders)
    .where(
      and(
        eq(orders.id, parsed.data),
        scopedToVenue(orders.venueId, venue.id),
      ),
    )
    .limit(1);
  if (!order) return null;

  const refundedCents = await refundedCentsForOrder(parsed.data);
  return {
    totalCents: order.totalCents,
    refundedCents,
    remainingCents: remainingRefundableCents(order.totalCents, refundedCents),
    status: order.status,
  };
}
