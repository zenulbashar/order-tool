import { eq } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { venueMembers, venues } from "@/lib/db/schema";

export type Venue = typeof venues.$inferSelect;

/**
 * Require an authenticated user. Redirects to /signin when there is no
 * session. Server Actions and Server Components should call this (or check
 * `auth()` directly) — Server Functions are reachable via direct POST, so
 * never assume the caller is authenticated.
 */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
  return session.user;
}

/**
 * Resolve the venue for the current user. In Phase 0 an owner has exactly one
 * venue (created during onboarding); returns null when signed out or before a
 * venue exists.
 */
export async function getCurrentVenue(): Promise<Venue | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const rows = await db
    .select({ venue: venues })
    .from(venueMembers)
    .innerJoin(venues, eq(venues.id, venueMembers.venueId))
    .where(eq(venueMembers.userId, userId))
    .limit(1);

  return rows[0]?.venue ?? null;
}

/**
 * Resolve the current venue or redirect to onboarding when none exists.
 */
export async function requireVenue(): Promise<Venue> {
  const venue = await getCurrentVenue();
  if (!venue) {
    redirect("/onboarding");
  }
  return venue;
}

/**
 * Tenant-scoping convention
 * -------------------------
 * order-tool is multi-tenant by venue. EVERY query that reads or writes
 * venue-owned data MUST be filtered by venue_id. Feature tables added in later
 * phases must carry a `venueId` column (FK -> venues.id) and use this helper in
 * their WHERE clause so the scope is explicit and greppable. Resolve the active
 * venue with requireVenue() first, then:
 *
 *   const rows = await db
 *     .select()
 *     .from(orders)
 *     .where(scopedToVenue(orders.venueId, venue.id));
 */
export function scopedToVenue(venueIdColumn: AnyPgColumn, venueId: string) {
  return eq(venueIdColumn, venueId);
}
