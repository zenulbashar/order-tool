import { asc } from "drizzle-orm";

import { db } from "@/lib/db";
import { menuCategories } from "@/lib/db/schema";
import { scopedToVenue } from "@/lib/tenant";

/**
 * Read helpers for the menu dashboard. Every query is scoped to the venue and
 * ordered by sort_order with a created_at tiebreak for a stable sequence.
 */
export async function getCategoriesForVenue(venueId: string) {
  return db
    .select()
    .from(menuCategories)
    .where(scopedToVenue(menuCategories.venueId, venueId))
    .orderBy(asc(menuCategories.sortOrder), asc(menuCategories.createdAt));
}
