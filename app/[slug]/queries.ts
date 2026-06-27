import { and, asc, eq } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/lib/db";
import {
  menuCategories,
  menuItems,
  menuItemTags,
  menuItemVariants,
  modifierGroups,
  modifierOptions,
  venues,
} from "@/lib/db/schema";
import { scopedToVenue } from "@/lib/tenant";
import { normalizeDietaryTags } from "@/lib/validation";

import type { PublicMenu, PublicVenue } from "./types";

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
