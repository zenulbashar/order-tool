"use server";

import { randomBytes } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  menuItems,
  menuItemVariants,
  modifierGroups,
  modifierOptions,
  orderItemModifiers,
  orderItems,
  orders,
  venues,
} from "@/lib/db/schema";
import {
  computeApplicationFeeCents,
  getStripe,
  getStripePublishableKey,
} from "@/lib/stripe";
import { scopedToVenue } from "@/lib/tenant";
import { isReservedSlug, placeOrderSchema, type PlaceOrderInput } from "@/lib/validation";

export type PlaceOrderResult =
  | {
      ok: true;
      token: string;
      // Everything the browser needs to confirm payment against the PaymentIntent
      // we created on the venue's connected account. The publishable key is
      // public; the client never receives or sets the amount or the fee.
      clientSecret: string;
      stripeAccountId: string;
      publishableKey: string;
      amountCents: number;
    }
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
type VariantRow = {
  id: string;
  itemId: string;
  name: string;
  priceCents: number;
};
type LinePlan = {
  item: ItemRow;
  // The chosen size variant for a variant-priced line; null for a flat line.
  variant: VariantRow | null;
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
    .select({
      id: venues.id,
      stripeAccountId: venues.stripeAccountId,
      stripeChargesEnabled: venues.stripeChargesEnabled,
    })
    .from(venues)
    .where(eq(venues.slug, data.slug))
    .limit(1);
  if (!venue) return reject("Venue not found.");
  const venueId = venue.id;

  // Fail fast BEFORE writing any order: a venue that cannot accept payments must
  // never produce a payable-but-unpayable order. charges_enabled is the gate,
  // mirrored from Stripe by the Connect onboarding flow.
  if (!venue.stripeChargesEnabled || !venue.stripeAccountId) {
    return reject("This venue isn't accepting online payments yet.");
  }
  const stripeAccountId = venue.stripeAccountId;

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

  // Size variants for the referenced items, scoped to THIS venue and item set.
  // Because the lookup is keyed on the venue id + the cart's item ids, a forged
  // or cross-venue variant id is structurally absent from the map and fails the
  // per-line ownership check below — the same defense the modifier options use.
  // An item present in itemsWithVariants is variant-priced (its base price_cents
  // is ignored); an item absent from it is flat-priced and must carry no variant.
  const variantRows = await db
    .select({
      id: menuItemVariants.id,
      itemId: menuItemVariants.itemId,
      name: menuItemVariants.name,
      priceCents: menuItemVariants.priceCents,
    })
    .from(menuItemVariants)
    .where(
      and(
        scopedToVenue(menuItemVariants.venueId, venueId),
        inArray(menuItemVariants.itemId, itemIds),
      ),
    );
  const variantById = new Map(variantRows.map((row) => [row.id, row]));
  const itemsWithVariants = new Set(variantRows.map((row) => row.itemId));

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

    // VARIANT: derive this line's base price. A variant-priced item REQUIRES a
    // chosen size that belongs to THIS item (the venue is already scoped by the
    // fetch); a flat-priced item must carry no variant. The base is read from the
    // DB row — the client's price is never trusted, and an invalid/missing/stray
    // variant id is rejected, not silently priced.
    const hasVariants = itemsWithVariants.has(line.itemId);
    let baseCents: number;
    let chosenVariant: VariantRow | null = null;
    if (hasVariants) {
      if (!line.variantId) {
        return reject("Please choose a size for an item in your cart.");
      }
      const variant = variantById.get(line.variantId);
      if (!variant || variant.itemId !== line.itemId) {
        return reject("A size in your cart is no longer available.");
      }
      baseCents = variant.priceCents;
      chosenVariant = variant;
    } else {
      if (line.variantId) return reject("Invalid selection.");
      baseCents = item.priceCents;
    }

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

    // Modifiers layer ON TOP of the size: base is the variant (or item) price,
    // plus the server-recomputed modifier deltas. Identical math to before — only
    // the base differs for variant-priced lines.
    const deltaCents = chosen.reduce((sum, o) => sum + o.priceDeltaCents, 0);
    const unitCents = baseCents + deltaCents;
    const lineTotalCents = unitCents * line.quantity;
    subtotalCents += lineTotalCents;
    plan.push({
      item,
      variant: chosenVariant,
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
              // Chosen size snapshot (Phase 5c); all null for a flat line. The
              // name + price are immutable financial truth that survive later
              // menu edits. menu_item_variant_id is a SOFT analytics ref ONLY —
              // never read it back as a price; the price is the snapshot column.
              menuItemVariantId: entry.variant?.id ?? null,
              variantNameSnapshot: entry.variant?.name ?? null,
              variantPriceCentsSnapshot: entry.variant?.priceCents ?? null,
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

  // (g) PAYMENT: create a PaymentIntent as a DIRECT CHARGE on the venue's
  // connected account ({ stripeAccount } = the Stripe-Account header), taking a
  // server-computed application fee. `amount` is the SERVER-recomputed total —
  // the client never sets the amount or the fee. The order stays
  // 'pending_payment'; it is confirmed ONLY by the signature-verified webhook
  // (the inline stub is gone — there is no second confirmation path).
  const stripe = getStripe();
  try {
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: totalCents,
        currency: "aud",
        application_fee_amount: computeApplicationFeeCents(totalCents),
        automatic_payment_methods: { enabled: true },
        metadata: { orderId, venueId, publicToken: token },
      },
      // idempotencyKey keyed on the order so a retried submission of THIS order
      // reuses the same PaymentIntent instead of creating a duplicate charge.
      { stripeAccount: stripeAccountId, idempotencyKey: orderId },
    );

    if (!paymentIntent.client_secret) {
      return reject("We couldn't start payment. Please try again.");
    }

    await db
      .update(orders)
      .set({ stripePaymentIntentId: paymentIntent.id })
      .where(
        and(eq(orders.id, orderId), scopedToVenue(orders.venueId, venueId)),
      );

    return {
      ok: true,
      token,
      clientSecret: paymentIntent.client_secret,
      stripeAccountId,
      publishableKey: getStripePublishableKey(),
      amountCents: totalCents,
    };
  } catch {
    // The order remains 'pending_payment' with no PaymentIntent; surface a
    // retryable error rather than a confirmed order.
    return reject("We couldn't start payment. Please try again.");
  }
}
