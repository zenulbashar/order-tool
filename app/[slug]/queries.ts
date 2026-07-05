import { and, asc, desc, eq, isNotNull, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { unstable_cache } from "next/cache";
import { cache } from "react";

import { db } from "@/lib/db";
import {
  menuCategories,
  menuItems,
  menuItemTags,
  menuItemVariants,
  modifierGroups,
  modifierOptions,
  orderItems,
  orders,
  venues,
} from "@/lib/db/schema";
import { scopedToVenue } from "@/lib/tenant";
import { normalizeDietaryTags } from "@/lib/validation";

import type { PublicMenu, PublicRecommendations, PublicVenue } from "./types";

/**
 * Public venue resolver — NO session/user involved (cf. getCurrentVenue, which
 * is authed). Selects customer-safe fields only: never the owner id/email or
 * timestamps. Slugs are stored lowercase, so the incoming param is normalized.
 *
 * Wrapped in React cache() so generateMetadata and the page component share a
 * single query within one request.
 */
export const getPublicVenueBySlug = cache(
  async (slug: string): Promise<PublicVenue | null> => {
    const normalized = slug.trim().toLowerCase();
    if (normalized.length === 0) return null;

    const rows = await db
      .select({
        id: venues.id,
        slug: venues.slug,
        name: venues.name,
        brandColor: venues.brandColor,
        logoUrl: venues.logoUrl,
        storefrontDescription: venues.storefrontDescription,
        // Structured-data inputs (Phase 6) — public, consumed by the JSON-LD on
        // the storefront. Selected here so generateMetadata + the page + the
        // JSON-LD all share this one cached venue read (no extra query).
        streetAddress: venues.streetAddress,
        suburb: venues.suburb,
        state: venues.state,
        postcode: venues.postcode,
        country: venues.country,
        phone: venues.phone,
        openingHours: venues.openingHours,
        latitude: venues.latitude,
        longitude: venues.longitude,
        // Scheduled-pickup config (Phase 8) — feeds the storefront slot picker;
        // the server gate re-validates against these same values.
        timezone: venues.timezone,
        schedulingEnabled: venues.schedulingEnabled,
        schedulingLeadMinutes: venues.schedulingLeadMinutes,
        schedulingMaxDaysAhead: venues.schedulingMaxDaysAhead,
        // Pay-by-bank saving (Track B · 3b-ii) — powers the checkout "Save $X"
        // callout. Display only; the discount is always server-recomputed at
        // pay time by applyBankDiscount.
        paytoEnabled: venues.paytoEnabled,
        paytoDiscountMode: venues.paytoDiscountMode,
        paytoDiscountValue: venues.paytoDiscountValue,
        // GST/sales tax (inclusive) — display only. Powers the "incl. GST $X"
        // line on the checkout summary + receipt; never changes the charge.
        taxEnabled: venues.taxEnabled,
        taxRateBps: venues.taxRateBps,
        taxLabel: venues.taxLabel,
        // Live-ready signal (Phase 3c). Derived to a boolean in SQL so the raw
        // onboarding_completed_at timestamp never reaches the client shape.
        isLive: sql<boolean>`${venues.onboardingCompletedAt} is not null`,
      })
      .from(venues)
      .where(eq(venues.slug, normalized))
      .limit(1);

    return rows[0] ?? null;
  },
);

/**
 * Public menu tree for a venue. Customers only ever see is_active categories,
 * is_available items, and is_available options, ordered by sort_order with a
 * created_at tiebreak. Returns customer-safe fields only (no venue_id, no
 * timestamps). Categories that end up with zero available items are dropped so
 * a customer never lands on an empty section.
 */
export async function getPublicMenu(venueId: string): Promise<PublicMenu> {
  const [categories, items, groups, options, tags, variants] = await Promise.all([
    db
      .select({
        id: menuCategories.id,
        name: menuCategories.name,
        description: menuCategories.description,
      })
      .from(menuCategories)
      .where(
        and(
          scopedToVenue(menuCategories.venueId, venueId),
          eq(menuCategories.isActive, true),
        ),
      )
      .orderBy(asc(menuCategories.sortOrder), asc(menuCategories.createdAt)),
    db
      .select({
        id: menuItems.id,
        categoryId: menuItems.categoryId,
        name: menuItems.name,
        description: menuItems.description,
        priceCents: menuItems.priceCents,
        imageUrl: menuItems.imageUrl,
      })
      .from(menuItems)
      .where(
        and(
          scopedToVenue(menuItems.venueId, venueId),
          eq(menuItems.isAvailable, true),
        ),
      )
      .orderBy(asc(menuItems.sortOrder), asc(menuItems.createdAt)),
    db
      .select({
        id: modifierGroups.id,
        itemId: modifierGroups.itemId,
        name: modifierGroups.name,
        minSelect: modifierGroups.minSelect,
        maxSelect: modifierGroups.maxSelect,
      })
      .from(modifierGroups)
      .where(scopedToVenue(modifierGroups.venueId, venueId))
      .orderBy(asc(modifierGroups.sortOrder), asc(modifierGroups.createdAt)),
    db
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
          eq(modifierOptions.isAvailable, true),
        ),
      )
      .orderBy(asc(modifierOptions.sortOrder), asc(modifierOptions.createdAt)),
    db
      .select({
        itemId: menuItemTags.itemId,
        tag: menuItemTags.tag,
      })
      .from(menuItemTags)
      .where(scopedToVenue(menuItemTags.venueId, venueId)),
    // Size variants (Phase 5b). Venue-scoped and customer-safe (id, name, and
    // the variant's OWN absolute price only). sort_order with a created_at
    // tiebreak gives the same stable order the owner set, mirroring options/tags.
    db
      .select({
        id: menuItemVariants.id,
        itemId: menuItemVariants.itemId,
        name: menuItemVariants.name,
        priceCents: menuItemVariants.priceCents,
      })
      .from(menuItemVariants)
      .where(scopedToVenue(menuItemVariants.venueId, venueId))
      .orderBy(
        asc(menuItemVariants.sortOrder),
        asc(menuItemVariants.createdAt),
      ),
  ]);

  const optionsByGroup = new Map<string, typeof options>();
  for (const option of options) {
    const list = optionsByGroup.get(option.groupId) ?? [];
    list.push(option);
    optionsByGroup.set(option.groupId, list);
  }
  const groupsByItem = new Map<string, typeof groups>();
  for (const group of groups) {
    const list = groupsByItem.get(group.itemId) ?? [];
    list.push(group);
    groupsByItem.set(group.itemId, list);
  }
  const variantsByItem = new Map<string, typeof variants>();
  for (const variant of variants) {
    const list = variantsByItem.get(variant.itemId) ?? [];
    list.push(variant);
    variantsByItem.set(variant.itemId, list);
  }
  const itemsByCategory = new Map<string, typeof items>();
  for (const item of items) {
    const list = itemsByCategory.get(item.categoryId) ?? [];
    list.push(item);
    itemsByCategory.set(item.categoryId, list);
  }
  // Collect each item's tag strings, then normalize once per item below to drop
  // any off-vocab value and apply the canonical display order.
  const rawTagsByItem = new Map<string, string[]>();
  for (const row of tags) {
    const list = rawTagsByItem.get(row.itemId) ?? [];
    list.push(row.tag);
    rawTagsByItem.set(row.itemId, list);
  }

  const menu: PublicMenu = [];
  for (const category of categories) {
    const categoryItems = itemsByCategory.get(category.id) ?? [];
    if (categoryItems.length === 0) continue; // hide empty categories
    menu.push({
      id: category.id,
      name: category.name,
      description: category.description,
      items: categoryItems.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        priceCents: item.priceCents,
        imageUrl: item.imageUrl,
        variants: (variantsByItem.get(item.id) ?? []).map((variant) => ({
          id: variant.id,
          name: variant.name,
          priceCents: variant.priceCents,
        })),
        tags: normalizeDietaryTags(rawTagsByItem.get(item.id) ?? []),
        groups: (groupsByItem.get(item.id) ?? []).map((group) => ({
          id: group.id,
          name: group.name,
          minSelect: group.minSelect,
          maxSelect: group.maxSelect,
          options: (optionsByGroup.get(group.id) ?? []).map((option) => ({
            id: option.id,
            name: option.name,
            priceDeltaCents: option.priceDeltaCents,
          })),
        })),
      })),
    });
  }

  return menu;
}

/* -------------------------------------------------------------------------- */
/* Frequently-bought-together recommendations (#11)                           */
/*                                                                            */
/* READ-ONLY and venue-scoped: an aggregate co-occurrence + popularity signal */
/* computed from EXISTING order_items.menu_item_id soft refs over this venue's */
/* CONFIRMED (paid) orders only. NO migration, NO new columns, NO writes, and  */
/* NO change to the cart/checkout/payment/webhook/order paths — recommended    */
/* items enter the cart through the existing item flow. Nothing crosses venues.*/
/* -------------------------------------------------------------------------- */

// Tuning constants. A pair must co-occur in at least MIN_PAIR_ORDERS CONFIRMED
// orders to count as signal (1 is coincidence/noise). Below MIN_VENUE_ORDERS
// confirmed orders the venue has too little history to recommend at all, so
// every surface hides (cold-start). Per-anchor partners and the popularity list
// are capped so the cached payload — and the client bundle it ships in — stay
// bounded regardless of menu size; the storefront only ever shows up to 4.
const MIN_PAIR_ORDERS = 2;
const MIN_VENUE_ORDERS = 5;
const MAX_PARTNERS_PER_ANCHOR = 8;
const MAX_POPULAR = 20;

type CoOccurrence = {
  byItem: Record<string, string[]>;
  popular: string[];
  hasHistory: boolean;
};

/**
 * The expensive, slow-moving half: the per-venue co-occurrence + popularity
 * aggregate over order_items, wrapped in the Next data cache so it runs at most
 * once per venue per hour instead of on every storefront load (React cache()
 * alone only dedups within one request). Returns ONLY menu-item ids + a boolean
 * — no counts leave here: pairs are pre-filtered by MIN_PAIR_ORDERS and sorted
 * strongest-first, so list position alone encodes strength.
 *
 * unstable_cache is the documented mechanism for caching non-fetch DB queries in
 * a project that has NOT adopted Cache Components (Next 16 "Caching and
 * Revalidating (Previous Model)" guide). Keyed by venueId, 1h revalidate, tagged
 * per venue. Availability is deliberately NOT baked in here: it is applied live
 * in getRecommendations against the current menu, so an item toggled unavailable
 * drops from recommendations on the next load, never up to an hour later.
 */
const getVenueCoOccurrence = (venueId: string): Promise<CoOccurrence> =>
  unstable_cache(
    async (): Promise<CoOccurrence> => {
      const a = alias(orderItems, "a");
      const b = alias(orderItems, "b");

      const [pairRows, popularRows, confirmedRows] = await Promise.all([
        // Self-join within the venue: how many CONFIRMED orders contain BOTH
        // distinct items. COUNT(DISTINCT order_id) so a multi-line order counts
        // once; both directions kept so lookup by anchor is direct. Null soft
        // refs (deleted items) are excluded, never recommended.
        db
          .select({
            anchor: a.menuItemId,
            partner: b.menuItemId,
            together: sql<number>`count(distinct ${a.orderId})::int`,
          })
          .from(a)
          .innerJoin(
            b,
            and(eq(b.orderId, a.orderId), ne(b.menuItemId, a.menuItemId)),
          )
          .innerJoin(orders, eq(orders.id, a.orderId))
          .where(
            and(
              scopedToVenue(a.venueId, venueId),
              eq(orders.status, "confirmed"),
              isNotNull(a.menuItemId),
              isNotNull(b.menuItemId),
            ),
          )
          .groupBy(a.menuItemId, b.menuItemId)
          .having(sql`count(distinct ${a.orderId}) >= ${MIN_PAIR_ORDERS}`)
          .orderBy(desc(sql`count(distinct ${a.orderId})`), asc(b.menuItemId)),
        // Popularity fallback: confirmed orders containing each item, most first.
        db
          .select({
            itemId: orderItems.menuItemId,
            orders: sql<number>`count(distinct ${orderItems.orderId})::int`,
          })
          .from(orderItems)
          .innerJoin(orders, eq(orders.id, orderItems.orderId))
          .where(
            and(
              scopedToVenue(orderItems.venueId, venueId),
              eq(orders.status, "confirmed"),
              isNotNull(orderItems.menuItemId),
            ),
          )
          .groupBy(orderItems.menuItemId)
          .orderBy(desc(sql`count(distinct ${orderItems.orderId})`))
          .limit(MAX_POPULAR),
        // History gate: how many confirmed orders this venue has at all.
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(orders)
          .where(
            and(
              scopedToVenue(orders.venueId, venueId),
              eq(orders.status, "confirmed"),
            ),
          ),
      ]);

      const byItem: Record<string, string[]> = {};
      for (const { anchor, partner } of pairRows) {
        if (!anchor || !partner) continue; // defensive; SQL already drops nulls
        const list = (byItem[anchor] ??= []);
        if (list.length < MAX_PARTNERS_PER_ANCHOR) list.push(partner);
      }

      const popular = popularRows
        .map((row) => row.itemId)
        .filter((id): id is string => id !== null);

      const hasHistory = (confirmedRows[0]?.count ?? 0) >= MIN_VENUE_ORDERS;

      return { byItem, popular, hasHistory };
    },
    ["recommendations", venueId],
    { revalidate: 3600, tags: [`recommendations:${venueId}`] },
  )();

/**
 * The live, cheap half: take the cached aggregate and intersect it with the
 * CURRENT menu so recommendations only ever reference items a customer can add
 * right now — available items in active categories, exactly the set
 * getPublicMenu returns. An anchor or partner that is now unavailable / in an
 * inactive category / deleted simply isn't in that set and drops out here.
 * Wrapped in React cache() for per-request dedup. The in-cart exclusion and the
 * 2–4 cap happen at render, where the cart state lives. Returns a customer-safe
 * payload (ids + one boolean only). Pass the menu already loaded for the page so
 * this adds no extra menu read.
 */
export const getRecommendations = cache(
  async (
    venueId: string,
    menu: PublicMenu,
  ): Promise<PublicRecommendations> => {
    const available = new Set<string>();
    for (const category of menu) {
      for (const item of category.items) available.add(item.id);
    }

    const { byItem, popular, hasHistory } = await getVenueCoOccurrence(venueId);

    const filtered: Record<string, string[]> = {};
    for (const [anchor, partners] of Object.entries(byItem)) {
      if (!available.has(anchor)) continue;
      const live = partners.filter((id) => available.has(id));
      if (live.length > 0) filtered[anchor] = live;
    }

    return {
      byItem: filtered,
      popular: popular.filter((id) => available.has(id)),
      hasHistory,
    };
  },
);
