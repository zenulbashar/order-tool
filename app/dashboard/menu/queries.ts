import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  ingredients,
  menuCategories,
  menuItems,
  menuItemTags,
  menuItemVariants,
  modifierGroups,
  modifierOptions,
  recipeLines,
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

export async function getVariantsForVenue(venueId: string) {
  return db
    .select()
    .from(menuItemVariants)
    .where(scopedToVenue(menuItemVariants.venueId, venueId))
    .orderBy(asc(menuItemVariants.sortOrder), asc(menuItemVariants.createdAt));
}

/**
 * Every dietary/allergen tag set on this venue's items. Flat + venue-scoped;
 * the page groups it into a tag-set per item (the editor pre-checks the item's
 * current tags). created_at gives a stable order, though the editor renders
 * tags in the canonical DIETARY_TAGS order regardless.
 */
export async function getTagsForVenue(venueId: string) {
  return db
    .select()
    .from(menuItemTags)
    .where(scopedToVenue(menuItemTags.venueId, venueId))
    .orderBy(asc(menuItemTags.createdAt));
}

/**
 * All recipe lines for the venue, joined to the ingredient data needed to cost
 * them (D2). Flat + venue-scoped; the editor groups them per item. The join
 * carries pack size/cost/yield so dish cost is derived client-side from the
 * same lib/stock/cost.ts helpers the ingredients library uses.
 */
export async function getRecipeLinesForVenue(venueId: string) {
  return db
    .select({
      id: recipeLines.id,
      menuItemId: recipeLines.menuItemId,
      ingredientId: recipeLines.ingredientId,
      qty: recipeLines.qty,
      ingredientName: ingredients.name,
      unit: ingredients.unit,
      packSize: ingredients.packSize,
      packCostCents: ingredients.packCostCents,
      yieldPct: ingredients.yieldPct,
      isPackaging: ingredients.isPackaging,
    })
    .from(recipeLines)
    .innerJoin(ingredients, eq(ingredients.id, recipeLines.ingredientId))
    .where(scopedToVenue(recipeLines.venueId, venueId))
    .orderBy(asc(recipeLines.createdAt));
}

/** Ingredient picker options for the recipe editor (name + unit + cost data). */
export async function getIngredientsForVenue(venueId: string) {
  return db
    .select()
    .from(ingredients)
    .where(scopedToVenue(ingredients.venueId, venueId))
    .orderBy(asc(ingredients.name));
}
