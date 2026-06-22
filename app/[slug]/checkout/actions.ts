"use server";

import { randomBytes } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  menuItems,
  modifierGroups,
  modifierOptions,
  orderItemModifiers,
  orderItems,
  orders,
  venues,
} from "@/lib/db/schema";
import { scopedToVenue } from "@/lib/tenant";
import { isReservedSlug, placeOrderSchema, type PlaceOrderInput } from "@/lib/validation";

export type PlaceOrderResult =
  | { ok: true; token: string }
  | { ok: false; error: string };

function reject(error: string): PlaceOrderResult {
  return { ok: false, error };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

/** URL-safe, 192-bit opaque token; the unique index is the collision backstop. */
function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

type ItemRow = { id: string; name: string; priceCents: number };
type LinePlan = {
  item: ItemRow;
  quantity: number;
  unitCents: number;
  lineTotalCents: number;
  options: { id: string; name: string; priceDeltaCents: number }[];
};

/**
 * Public, unauthenticated order placement. Treats every field as hostile:
 * recomputes the true total from LIVE, venue-scoped DB prices and ignores any
 * client price; re-checks every id; enforces modifier rules server-side; and
 * sets every sensitive column itself (mass-assignment defense). Returns the
 * opaque public_token on success — the client navigates to the confirmation.
 */
export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const parsed = placeOrderSchema.safeParse(input);
  if (!parsed.success) {
    return reject(parsed.error.issues[0]?.message ?? "Invalid order.");
  }
  const data = parsed.data;

  // (a) Resolve venue by slug. Reserved slugs never resolve to a storefront,
  // matching the route backstop — defense in depth.
  if (isReservedSlug(data.slug)) return reject("Venue not found.");
  const [venue] = await db
    .select({ id: venues.id })
    .from(venues)
    .where(eq(venues.slug, data.slug))
    .limit(1);
  if (!venue) return reject("Venue not found.");
  const venueId = venue.id;

  // (b) Bounds (non-empty, <=50 lines, qty 1..50) are enforced by the schema.

  // (c) Batch-fetch everything referenced, scoped to THIS venue and to
  // available rows only. Anything the client references that isn't returned
  // here (wrong venue, unavailable, deleted) will fail the per-line checks.
  const itemIds = [...new Set(data.lines.map((line) => line.itemId))];
  const itemRows = await db
    .select({
      id: menuItems.id,
      name: menuItems.name,
      priceCents: menuItems.priceCents,
    })
    .from(menuItems)
    .where(
      and(
        scopedToVenue(menuItems.venueId, venueId),
        inArray(menuItems.id, itemIds),
        eq(menuItems.isAvailable, true),
      ),
    );
  const itemById = new Map(itemRows.map((row) => [row.id, row]));

  const groupRows = await db
    .select({
      id: modifierGroups.id,
      itemId: modifierGroups.itemId,
      minSelect: modifierGroups.minSelect,
      maxSelect: modifierGroups.maxSelect,
    })
    .from(modifierGroups)
    .where(
      and(
        scopedToVenue(modifierGroups.venueId, venueId),
        inArray(modifierGroups.itemId, itemIds),
      ),
    );
  const groupById = new Map(groupRows.map((group) => [group.id, group]));
  const groupsByItem = new Map<string, typeof groupRows>();
  for (const group of groupRows) {
    const list = groupsByItem.get(group.itemId) ?? [];
    list.push(group);
    groupsByItem.set(group.itemId, list);
  }

  const groupIds = groupRows.map((group) => group.id);
  const optionRows = groupIds.length
    ? await db
        .select({
          id: modifierOptions.id,
          groupId: modifierOptions.groupId,
          name: modifierOptions.name,
          priceDeltaCents: modifierOptions.priceDeltaCents,
        })
        .from(modifierOptions)
        .where(
          and(
            scopedToVenue(modifierOptions.venueId, venueId),
            inArray(modifierOptions.groupId, groupIds),
            eq(modifierOptions.isAvailable, true),
          ),
        )
    : [];
  const optionById = new Map(optionRows.map((option) => [option.id, option]));

  // (c–e) Validate each line against live data, enforce modifier rules, and
  // recompute totals from DB values only.
  const plan: LinePlan[] = [];
  let subtotalCents = 0;

  for (const line of data.lines) {
    const item = itemById.get(line.itemId);
    if (!item) return reject("An item in your cart is no longer available.");

    const optionIds = line.selectedOptionIds;
    if (new Set(optionIds).size !== optionIds.length) {
      return reject("Invalid selection.");
    }

    const chosen: { id: string; name: string; priceDeltaCents: number }[] = [];
    const countByGroup = new Map<string, number>();
    for (const optionId of optionIds) {
      const option = optionById.get(optionId);
      if (!option) return reject("A selected option is no longer available.");
      const group = groupById.get(option.groupId);
      // The option's group MUST belong to this line's item — blocks
      // cross-item / cross-venue option injection.
      if (!group || group.itemId !== line.itemId) {
        return reject("Invalid selection.");
      }
      countByGroup.set(
        option.groupId,
        (countByGroup.get(option.groupId) ?? 0) + 1,
      );
      chosen.push({
        id: option.id,
        name: option.name,
        priceDeltaCents: option.priceDeltaCents,
      });
    }

    // Enforce min/max per group server-side; never trust client-side gating.
    for (const group of groupsByItem.get(line.itemId) ?? []) {
      const selected = countByGroup.get(group.id) ?? 0;
      if (selected < group.minSelect || selected > group.maxSelect) {
        return reject("Please review the required options for an item.");
      }
    }

    const deltaCents = chosen.reduce((sum, o) => sum + o.priceDeltaCents, 0);
    const unitCents = item.priceCents + deltaCents;
    const lineTotalCents = unitCents * line.quantity;
    subtotalCents += lineTotalCents;
    plan.push({
      item,
      quantity: line.quantity,
      unitCents,
      lineTotalCents,
      options: chosen,
    });
  }

  const totalCents = subtotalCents; // no tax / fees / tips this phase

  // (f) Write order + items + modifiers in ONE transaction. Every sensitive
  // column (venue_id, token, status, all totals/snapshots) is set from
  // server-derived values — client input is never spread in. Retry on the
  // (astronomically unlikely) token collision against the unique index.
  let token = "";
  let orderId = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    token = generateToken();
    try {
      orderId = await db.transaction(async (tx) => {
        const [order] = await tx
          .insert(orders)
          .values({
            venueId,
            publicToken: token,
            orderType: data.orderType,
            tableLabel: data.orderType === "dine_in" ? data.tableLabel : null,
            customerName: data.customerName,
            customerPhone: data.customerPhone,
            status: "pending_payment",
            subtotalCents,
            totalCents,
          })
          .returning({ id: orders.id });

        for (const entry of plan) {
          const [orderItem] = await tx
            .insert(orderItems)
            .values({
              orderId: order.id,
              venueId,
              menuItemId: entry.item.id,
              itemNameSnapshot: entry.item.name,
              unitPriceCentsSnapshot: entry.unitCents,
              quantity: entry.quantity,
              lineTotalCents: entry.lineTotalCents,
            })
            .returning({ id: orderItems.id });

          if (entry.options.length > 0) {
            await tx.insert(orderItemModifiers).values(
              entry.options.map((option) => ({
                orderItemId: orderItem.id,
                venueId,
                modifierOptionId: option.id,
                nameSnapshot: option.name,
                priceDeltaCentsSnapshot: option.priceDeltaCents,
              })),
            );
          }
        }

        return order.id;
      });
      break;
    } catch (error) {
      if (isUniqueViolation(error) && attempt < 2) {
        orderId = "";
        continue; // token collision — regenerate and retry
      }
      throw error;
    }
  }

  if (!orderId) return reject("Could not place your order. Please try again.");

  // (g) PAYMENT SEAM (stub): the order was written as 'pending_payment'; confirm
  // it inline now. In 2c this is triggered by the Stripe webhook instead — the
  // creation/recompute code above is final; only this trigger changes.
  await confirmOrderStub(orderId);

  return { ok: true, token };
}

/**
 * Payment confirmation seam. Flips a pending order to 'confirmed'. There is no
 * real payment yet.
 */
async function confirmOrderStub(orderId: string): Promise<void> {
  // STUB: in 2c this transition is driven by the Stripe payment webhook, not inline.
  await db
    .update(orders)
    .set({ status: "confirmed" })
    .where(and(eq(orders.id, orderId), eq(orders.status, "pending_payment")));
}
