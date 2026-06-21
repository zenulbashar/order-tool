import { asc } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  menuCategories,
  menuItems,
  modifierGroups,
  modifierOptions,
} from "@/lib/db/schema";
import { scopedToVenue } from "@/lib/tenant";

/**
 * Read helpers for the menu dashboard. Every query is scoped to the venue and
 * ordered by sort_order with a created_at tiebreak for a stable sequence. The
 * page assembles these flat, venue-scoped lists into the category -> item ->
 * group -> option tree.
 */
export async function getCategoriesForVenue(venueId: string) {
  return db
    .select()
    .from(menuCategories)
    .where(scopedToVenue(menuCategories.venueId, venueId))
    .orderBy(asc(menuCategories.sortOrder), asc(menuCategories.createdAt));
}

export async function getItemsForVenue(venueId: string) {
  return db
    .select()
    .from(menuItems)
    .where(scopedToVenue(menuItems.venueId, venueId))
    .orderBy(asc(menuItems.sortOrder), asc(menuItems.createdAt));
}

export async function getGroupsForVenue(venueId: string) {
  return db
    .select()
    .from(modifierGroups)
    .where(scopedToVenue(modifierGroups.venueId, venueId))
    .orderBy(asc(modifierGroups.sortOrder), asc(modifierGroups.createdAt));
}

export async function getOptionsForVenue(venueId: string) {
  return db
    .select()
    .from(modifierOptions)
    .where(scopedToVenue(modifierOptions.venueId, venueId))
    .orderBy(asc(modifierOptions.sortOrder), asc(modifierOptions.createdAt));
}
