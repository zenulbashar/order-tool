"use server";

import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import {
  createLoginToken,
  destroyCustomerSession,
  getCustomer,
} from "@/lib/customer/auth";
import { sendCustomerMagicLinkEmail } from "@/lib/customer/email";
import { db } from "@/lib/db";
import {
  orderItemModifiers,
  orderItems,
  orders,
  venues,
} from "@/lib/db/schema";
import { scopedToVenue } from "@/lib/tenant";
import { getBaseUrl } from "@/lib/url";
import { customerEmailSchema, idSchema, isReservedSlug } from "@/lib/validation";

import type { CartSeedLine } from "./types";

export type ActionResult = { ok: true } | { ok: false; error: string };

export type ReorderResult =
  | { ok: true; lines: CartSeedLine[]; droppedCount: number }
  | { ok: false; error: string };

/** Resolve a public venue by slug. Reserved slugs never resolve (route backstop). */
async function resolveVenue(
  slug: string,
): Promise<{ id: string; name: string; slug: string } | null> {
  if (isReservedSlug(slug)) return null;
  const [venue] = await db
    .select({ id: venues.id, name: venues.name, slug: venues.slug })
    .from(venues)
    .where(eq(venues.slug, slug.trim().toLowerCase()))
    .limit(1);
  return venue ?? null;
}

/**
 * Request a customer magic link. Always returns a generic `ok` after validation:
 * the link is sent unconditionally for any valid email at a real venue (the
 * customer is created on first verify), so there is no account to disclose. The
 * raw token only ever lives in the emailed URL.
 */
export async function requestCustomerMagicLink(
  slug: string,
  emailInput: string,
): Promise<ActionResult> {
  const venue = await resolveVenue(slug);
  if (!venue) return { ok: false, error: "Venue not found." };

  const parsed = customerEmailSchema.safeParse(emailInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Enter a valid email address.",
    };
  }
  const email = parsed.data;

  try {
    const token = await createLoginToken(venue.id, email);
    const baseUrl = await getBaseUrl();
    const url = `${baseUrl}/${venue.slug}/account/verify?token=${encodeURIComponent(token)}`;
    await sendCustomerMagicLinkEmail({ to: email, venueName: venue.name, url });
  } catch {
    // Swallow: never surface send/config failures to the caller. The customer
    // sees the same "check your email" either way. (Rate-limiting is deferred,
    // matching the project's posture on the public checkout endpoint.)
  }
  return { ok: true };
}

/** Sign the customer out (delete the session row + clear the cookie). */
export async function signOutCustomer(): Promise<void> {
  await destroyCustomerSession();
}

/**
 * Link an order to the signed-in customer. IDOR-safe:
 *  - the customer is SESSION-derived (never client input);
 *  - authorization is possession of the unguessable 192-bit public_token (the
 *    same bearer capability that already authorizes viewing the order);
 *  - `customer_id IS NULL` prevents taking an order already owned by someone
 *    else and makes a re-claim a harmless no-op.
 * Returns a generic ok after auth so a hit vs miss is never disclosed.
 */
export async function claimOrder(
  slug: string,
  token: string,
): Promise<ActionResult> {
  const venue = await resolveVenue(slug);
  if (!venue) return { ok: false, error: "Venue not found." };

  const customer = await getCustomer(venue.id);
  if (!customer) return { ok: false, error: "Please sign in first." };

  const parsedToken = idSchema.safeParse(token);
  if (!parsedToken.success) return { ok: false, error: "Invalid order." };

  await db
    .update(orders)
    .set({ customerId: customer.id })
    .where(
      and(
        scopedToVenue(orders.venueId, venue.id),
        eq(orders.publicToken, parsedToken.data),
        isNull(orders.customerId),
      ),
    );
  return { ok: true };
}

/**
 * Build a cart seed from one of the customer's OWN past orders so it can be
 * reordered. Returns ids only (item / variant / option) — NEVER prices: the
 * cart re-validates them against the live menu and checkout re-prices, so a
 * reorder always goes through the same verified placeOrder recompute.
 *
 * Ownership is enforced server-side: the order must match this venue AND the
 * session-derived customer_id, so a customer can only ever reorder their own.
 */
export async function reorder(
  slug: string,
  token: string,
): Promise<ReorderResult> {
  const venue = await resolveVenue(slug);
  if (!venue) return { ok: false, error: "Venue not found." };

  const customer = await getCustomer(venue.id);
  if (!customer) return { ok: false, error: "Please sign in first." };

  const parsedToken = idSchema.safeParse(token);
  if (!parsedToken.success) return { ok: false, error: "Invalid order." };

  const [order] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        scopedToVenue(orders.venueId, venue.id),
        eq(orders.publicToken, parsedToken.data),
        eq(orders.customerId, customer.id),
      ),
    )
    .limit(1);
  if (!order) return { ok: false, error: "Order not found." };

  const items = await db
    .select({
      id: orderItems.id,
      menuItemId: orderItems.menuItemId,
      menuItemVariantId: orderItems.menuItemVariantId,
      quantity: orderItems.quantity,
    })
    .from(orderItems)
    .where(
      and(
        eq(orderItems.orderId, order.id),
        scopedToVenue(orderItems.venueId, venue.id),
      ),
    )
    .orderBy(asc(orderItems.createdAt));

  const itemRowIds = items.map((item) => item.id);
  const modifierRows = itemRowIds.length
    ? await db
        .select({
          orderItemId: orderItemModifiers.orderItemId,
          modifierOptionId: orderItemModifiers.modifierOptionId,
        })
        .from(orderItemModifiers)
        .where(
          and(
            inArray(orderItemModifiers.orderItemId, itemRowIds),
            scopedToVenue(orderItemModifiers.venueId, venue.id),
          ),
        )
    : [];

  const optionsByItem = new Map<string, string[]>();
  for (const modifier of modifierRows) {
    // modifier_option_id is a nullable soft ref; a line we can't reconstruct
    // its options for just reorders without them (the menu reconciliation and
    // server recompute remain authoritative either way).
    if (!modifier.modifierOptionId) continue;
    const list = optionsByItem.get(modifier.orderItemId) ?? [];
    list.push(modifier.modifierOptionId);
    optionsByItem.set(modifier.orderItemId, list);
  }

  const lines: CartSeedLine[] = [];
  let droppedCount = 0;
  for (const item of items) {
    // A line with no menu_item_id soft ref can't be re-added; surface it as
    // dropped. (Current orders always carry it; this is defensive.)
    if (!item.menuItemId) {
      droppedCount += 1;
      continue;
    }
    lines.push({
      itemId: item.menuItemId,
      variantId: item.menuItemVariantId,
      selectedOptionIds: optionsByItem.get(item.id) ?? [],
      quantity: item.quantity,
    });
  }

  return { ok: true, lines, droppedCount };
}
