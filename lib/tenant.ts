import { asc, eq } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { venueMembers, venues } from "@/lib/db/schema";

export type Venue = typeof venues.$inferSelect;

/**
 * Cookie holding the owner's SELECTED venue id. It is only a UI preference,
 * never an authorization token: whatever id it carries is validated against the
 * user's venue_members rows on every resolve (see getCurrentVenue), so a forged
 * or stale value can never widen access. Kept httpOnly — no client code reads
 * it; the switcher mutates it through a server action.
 */
const SELECTED_VENUE_COOKIE = "ot_selected_venue";

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
 * Every venue the given user is a member of, oldest first. Wrapped in React
 * cache() so getCurrentVenue(), getUserVenues(), and isVenueMember() share ONE
 * query per request. This is the single venue-scoped membership read that all
 * venue resolution flows through — selecting venues by the user's own
 * memberships (never by a client-supplied id) is what makes the scope safe.
 */
const getMembershipVenues = cache(async (userId: string): Promise<Venue[]> => {
  const rows = await db
    .select({ venue: venues })
    .from(venueMembers)
    .innerJoin(venues, eq(venues.id, venueMembers.venueId))
    .where(eq(venueMembers.userId, userId))
    // Deterministic fallback order: the "first venue" is always the oldest one.
    .orderBy(asc(venues.createdAt));
  return rows.map((row) => row.venue);
});

/**
 * Resolve the venue the owner is currently managing.
 *
 *  1. Load the user's OWN venues (their venue_members rows).
 *  2. If the selected-venue cookie names one of those venues, use it.
 *  3. Otherwise fall back to their first (oldest) venue.
 *  4. Return null when signed out or before any venue exists.
 *
 * The cookie's id is only ever matched against the user's own set — we never
 * query a venue BY the cookie id — so a missing, stale, or forged cookie can
 * never resolve to a venue the user isn't a member of. This is the IDOR gate.
 *
 * Read-only: it never writes the cookie. Setting cookies during Server
 * Component rendering is illegal in Next 16; the cookie is written only by the
 * server actions setCurrentVenue() and createVenueFromOnboarding().
 */
export async function getCurrentVenue(): Promise<Venue | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const myVenues = await getMembershipVenues(userId);
  if (myVenues.length === 0) return null;

  const selectedId = (await cookies()).get(SELECTED_VENUE_COOKIE)?.value;
  const selected = selectedId
    ? myVenues.find((venue) => venue.id === selectedId)
    : undefined;

  return selected ?? myVenues[0];
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
 * Has this venue finished the onboarding wizard? The SINGLE source of truth for
 * "live-ready": onboarding_completed_at is stamped only when the final step (go
 * live, a later sub-phase) succeeds. Pure read — no I/O.
 */
export function isOnboardingComplete(venue: Venue): boolean {
  return venue.onboardingCompletedAt !== null;
}

/**
 * Resolve the current venue and require that its onboarding is COMPLETE,
 * otherwise redirect into the wizard to finish setup.
 *
 * Phase 3a builds this seam but deliberately does NOT call it yet: onboarding is
 * mandatory only for the GO-LIVE / order-taking path, and that surface (the
 * diner storefront + checkout) is out of scope this phase, plus the final wizard
 * step that flips onboarding_completed_at does not exist until Phase 3c. The
 * dashboard stays reachable with a "finish setup" nudge — no lockout.
 *
 * >>> PHASE 3c HOOK: call this (or check isOnboardingComplete) at the order-
 * accepting entry points — app/[slug]/checkout/actions.ts placeOrder and the
 * concierge/cart surfaces — to block taking orders until the venue is live.
 * That is the ONLY place the hard block belongs; do not scatter it elsewhere.
 */
export async function requireOnboardedVenue(): Promise<Venue> {
  const venue = await requireVenue();
  if (!isOnboardingComplete(venue)) {
    redirect("/onboarding");
  }
  return venue;
}

/**
 * Every venue the current user is a member of (for the venue switcher and the
 * "you have N locations" UI). Empty when signed out. Scoped to the user's
 * memberships — never returns a venue they don't belong to.
 */
export async function getUserVenues(): Promise<Venue[]> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return [];
  return getMembershipVenues(userId);
}

/**
 * Is the user a member of this venue? The gate every venue-selection write
 * (setCurrentVenue) MUST pass before trusting a client-supplied venueId. Checks
 * against the user's OWN membership set, so it can never be tricked into
 * approving a venue they don't belong to.
 */
export async function isVenueMember(
  userId: string,
  venueId: string,
): Promise<boolean> {
  const myVenues = await getMembershipVenues(userId);
  return myVenues.some((venue) => venue.id === venueId);
}

/**
 * Persist the owner's selected venue. Writes the cookie ONLY — the caller is
 * responsible for validating membership first (setCurrentVenue) or for having
 * just created the venue+membership (createVenueFromOnboarding). Must run inside a Server
 * Action or Route Handler; Next 16 forbids cookie writes during RSC rendering.
 */
export async function setSelectedVenueCookie(venueId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SELECTED_VENUE_COOKIE, venueId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year — a preference, not a session token.
  });
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
