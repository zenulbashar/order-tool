"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { notifyCustomerOrder } from "@/lib/customer/notify";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { requireUser, requireVenue, scopedToVenue } from "@/lib/tenant";
import { fulfillmentStatusSchema, idSchema } from "@/lib/validation";

export type UpdateFulfillmentResult = { error?: string };

const ORDERS_PATH = "/dashboard/orders";

/**
 * Advance (or otherwise set) an order's kitchen fulfillment_status. Auth is
 * re-checked here because Server Functions are reachable via direct POST; the
 * redirects from requireUser/requireVenue stay outside any try/catch.
 *
 * IDOR-safe: the UPDATE is scoped by id AND the CURRENT venue, with a one-row
 * assertion, so a foreign (other-venue or unknown) order id changes nothing.
 * Only fulfillment_status is written — the payment status, totals, snapshots,
 * and Stripe fields are never in the SET, so the payment/checkout/webhook path
 * is untouched.
 */
export async function updateOrderFulfillmentStatus(
  orderId: string,
  newStatus: string,
): Promise<UpdateFulfillmentResult> {
  await requireUser();
  const venue = await requireVenue();

  const id = idSchema.safeParse(orderId);
  if (!id.success) return { error: "Missing order." };

  const status = fulfillmentStatusSchema.safeParse(newStatus);
  if (!status.success) return { error: "Invalid status." };

  const updated = await db
    .update(orders)
    .set({
      fulfillmentStatus: status.data,
      // Stamp the hand-off time so the Completed column can window on when the
      // order was actually completed (not when it was placed); clear it if the
      // order is moved back out of completed.
      completedAt: status.data === "completed" ? new Date() : null,
    })
    .where(and(eq(orders.id, id.data), scopedToVenue(orders.venueId, venue.id)))
    .returning({ id: orders.id });
  if (updated.length !== 1) return { error: "Order not found." };

  // ADDITIVE (customer notifications) — when the kitchen marks an order READY,
  // fire the ready email/SMS to the linked customer per their opt-in. Best-effort
  // and isolated in after() so it can never affect this action's result; a no-op
  // for guest orders and when the channels are unconfigured. Only "ready" is
  // notified (confirmation is sent from the payment webhook).
  if (status.data === "ready") {
    after(() => notifyCustomerOrder(id.data, "ready").catch(() => {}));
  }

  revalidatePath(ORDERS_PATH);
  return {};
}
