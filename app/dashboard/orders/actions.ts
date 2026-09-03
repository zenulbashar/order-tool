"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { notifyCustomerOrder } from "@/lib/customer/notify";
import { shouldNotifyReady } from "@/lib/orders/fulfillment-transition";
import { auth } from "@/lib/auth";
import { recordVenueAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { requireUser, requireVenuePermission, scopedToVenue } from "@/lib/tenant";
import {
  fulfillmentStatusSchema,
  idSchema,
  orderReference,
} from "@/lib/validation";

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
  /** The status the device was showing when the button was pressed. */
  expectedStatus: string,
): Promise<UpdateFulfillmentResult> {
  await requireUser();
  const venue = await requireVenuePermission("orders:manage");

  const id = idSchema.safeParse(orderId);
  if (!id.success) return { error: "Missing order." };

  const status = fulfillmentStatusSchema.safeParse(newStatus);
  if (!status.success) return { error: "Invalid status." };
  const expected = fulfillmentStatusSchema.safeParse(expectedStatus);
  if (!expected.success) return { error: "Invalid status." };

  // Compare-and-set on the CURRENT status. The board polls every ~12s, so a
  // device can act on a card another device has already moved; without this
  // predicate a stale tap silently regressed a handed-off order (and re-fired
  // its customer notification). A mismatch is reported, not applied.
  const updated = await db
    .update(orders)
    .set({
      fulfillmentStatus: status.data,
      // Stamp the hand-off time so the Completed column can window on when the
      // order was actually completed (not when it was placed); clear it if the
      // order is moved back out of completed.
      completedAt: status.data === "completed" ? new Date() : null,
    })
    .where(
      and(
        eq(orders.id, id.data),
        scopedToVenue(orders.venueId, venue.id),
        eq(orders.fulfillmentStatus, expected.data),
      ),
    )
    .returning({ id: orders.id, publicToken: orders.publicToken });
  if (updated.length !== 1) {
    const [current] = await db
      .select({ status: orders.fulfillmentStatus })
      .from(orders)
      .where(and(eq(orders.id, id.data), scopedToVenue(orders.venueId, venue.id)))
      .limit(1);
    if (!current) return { error: "Order not found." };
    return {
      error: `This order was already moved to "${current.status}" on another device.`,
    };
  }

  // M8 / audit F9 — order status transitions are one of the merchant-side
  // mutations the finding names; a refund dispute usually starts here.
  const session = await auth();
  await recordVenueAudit({
    venueId: venue.id,
    action: "order_status_changed",
    detail: `${orderReference(updated[0].publicToken)} → ${status.data}`,
    actor: { id: session?.user?.id, email: session?.user?.email },
  });

  // ADDITIVE (customer notifications) — when the kitchen ADVANCES an order to
  // READY, fire the ready email/SMS to the linked customer per their opt-in.
  // Best-effort and isolated in after() so it can never affect this action's
  // result; a no-op for guest orders and when the channels are unconfigured.
  // Keyed on the transition, not the target: "Back to ready" from Completed is
  // a correction and must not tell the diner a second time.
  if (shouldNotifyReady(expected.data, status.data)) {
    after(() => notifyCustomerOrder(id.data, "ready").catch(() => {}));
  }

  revalidatePath(ORDERS_PATH);
  return {};
}
