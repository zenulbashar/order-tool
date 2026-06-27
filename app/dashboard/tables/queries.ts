import { asc } from "drizzle-orm";

import { db } from "@/lib/db";
import { venueTables } from "@/lib/db/schema";
import { scopedToVenue } from "@/lib/tenant";

/**
 * All dine-in tables for a venue, ordered by sort_order with a created_at
 * tiebreak for a stable sequence — mirrors the menu read helpers. Venue-scoped.
 */
export async function getTablesForVenue(venueId: string) {
  return db
    .select()
    .from(venueTables)
    .where(scopedToVenue(venueTables.venueId, venueId))
    .orderBy(asc(venueTables.sortOrder), asc(venueTables.createdAt));
}
