import { and, asc, eq } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "@/lib/auth";
import {
  can,
  type Permission,
  type RoleKey,
  roleFromLegacyMemberRole,
} from "@/lib/authz";
import { db } from "@/lib/db";
import { venueMemberRoles, venueMembers, venues } from "@/lib/db/schema";
import { emailIsPlatformAdmin } from "@/lib/platform-admin";

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
 * Cookie naming the venue a PLATFORM ADMIN is currently "opening as" (the
 * operator support tool). Unlike the selected-venue cookie, this one CAN resolve
 * a venue outside the user's memberships — but ONLY while the session's email is
 * still on the PLATFORM_ADMIN_EMAILS allowlist, re-checked on every resolve. For
 * a non-admin (or an ex-admin after access is revoked) the cookie is inert and
 * ignored, so it can never widen a normal owner's access. httpOnly; written only
 * by the admin open/exit server actions.
 */
export const ADMIN_IMPERSONATE_COOKIE = "ot_admin_impersonate";

/**
 * The venue an authenticated platform admin is impersonating, or null. Resolves
 * the cookie'd venue by id — the one place a venue is loaded outside the caller's
 * own memberships — gated on a live allowlist re-check. Returns null (falling the
 * caller back to normal resolution) for a non-admin, a missing cookie, or a
 * cookie pointing at a deleted venue.
 */
async function resolveImpersonatedVenue(
  email: string | null | undefined,
): Promise<Venue | null> {
  if (!emailIsPlatformAdmin(email)) return null;
  const impersonateId = (await cookies()).get(ADMIN_IMPERSONATE_COOKIE)?.value;
  if (!impersonateId) return null;
  const [venue] = await db
    .select()
    .from(venues)
    .where(eq(venues.id, impersonateId))
    .limit(1);
  return venue ?? null;
}

/** The impersonated venue for the current session (for the dashboard banner). */
export async function getImpersonatedVenue(): Promise<Venue | null> {
  const session = await auth();
  return resolveImpersonatedVenue(session?.user?.email);
}

/** Start impersonating a venue (admin "Open as venue"). Cookie write only. */
export async function setImpersonationCookie(venueId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_IMPERSONATE_COOKIE, venueId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 4, // 4h — a support session, not a durable preference.
  });
}

/** Stop impersonating (admin "Exit"). Cookie clear only. */
export async function clearImpersonationCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_IMPERSONATE_COOKIE);
}

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

  // Platform-admin "Open as venue": when an operator is impersonating, resolve
  // THAT venue directly (the only path outside the user's own memberships),
  // gated on a live allowlist re-check. A non-admin falls straight through.
  const impersonated = await resolveImpersonatedVenue(session.user.email);
  if (impersonated) return impersonated;

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

/* -------------------------------------------------------------------------- */
/* Roles and permissions (M5 / audit F4)                                       */
/* -------------------------------------------------------------------------- */

/**
 * The roles a user holds at a venue, as a cumulative set.
 *
 * Resolution order, and why:
 *  1. Rows in `venue_member_roles` — the M5 source of truth, many-to-many.
 *  2. If the user has NO role rows but IS a member, fall back to the legacy
 *     `venue_members.role` column. This is what makes the migration free:
 *     every venue created before M5 keeps working, its owner keeps owner
 *     access, and nothing had to be backfilled.
 *  3. No membership at all → no roles.
 *
 * A PLATFORM ADMIN opening a venue through the support tool is granted owner
 * for the duration — the same widening `getCurrentVenue` already applies, and
 * it is re-derived from the allowlist on every call rather than cached.
 *
 * Wrapped in cache() so a page that checks several permissions issues one
 * query per request, matching getMembershipVenues.
 */
export const getVenueRoles = cache(
  async (userId: string, venueId: string): Promise<RoleKey[]> => {
    const assigned = await db
      .select({ role: venueMemberRoles.role })
      .from(venueMemberRoles)
      .where(
        and(
          eq(venueMemberRoles.userId, userId),
          eq(venueMemberRoles.venueId, venueId),
        ),
      );
    if (assigned.length > 0) {
      return [...new Set(assigned.map((row) => row.role))];
    }

    const [legacy] = await db
      .select({ role: venueMembers.role })
      .from(venueMembers)
      .where(
        and(
          eq(venueMembers.userId, userId),
          eq(venueMembers.venueId, venueId),
        ),
      )
      .limit(1);
    return legacy ? [roleFromLegacyMemberRole(legacy.role)] : [];
  },
);

/** The signed-in user's roles at the venue they're currently managing. */
export async function getCurrentVenueRoles(venueId: string): Promise<RoleKey[]> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return [];
  // Support-tool impersonation already resolves venues outside the user's
  // memberships; grant owner there so the operator view is not half-broken.
  if (await emailIsPlatformAdmin(session?.user?.email)) {
    const roles = await getVenueRoles(userId, venueId);
    return roles.length > 0 ? roles : ["owner"];
  }
  return getVenueRoles(userId, venueId);
}

/** Does the signed-in user hold this permission at this venue? */
export async function hasVenuePermission(
  venueId: string,
  permission: Permission,
): Promise<boolean> {
  return can(await getCurrentVenueRoles(venueId), permission);
}

/**
 * Resolve the current venue AND require a permission on it — the gate the
 * audit's F4 says must exist before any invite ships, since without it every
 * member row grants full owner powers.
 *
 * Server Functions are reachable by direct POST, so this must be called
 * INSIDE each protected action, not merely relied upon in the UI that hides
 * the button. Denial redirects to the dashboard rather than rendering a
 * forbidden page — the caller has a valid session, just not this capability.
 * Like the other redirects here it throws a control-flow signal, so call it
 * OUTSIDE any try/catch.
 */
export async function requireVenuePermission(
  permission: Permission,
): Promise<Venue> {
  const venue = await requireVenue();
  if (!(await hasVenuePermission(venue.id, permission))) {
    redirect("/dashboard?denied=1");
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
 * Resolve the current venue for a WIZARD STEP: require settings:manage AND that
 * onboarding is still unfinished. The mirror image of requireOnboardedVenue.
 *
 * Two separate reasons, both load-bearing:
 *  - Permission. The steps write the same venue config the dashboard's Settings
 *    screens do, so they carry the same capability. Without it, membership alone
 *    let a kitchen login re-run setup on a live venue.
 *  - Unfinished. The Stations step REPLACE-SETS venue_stations, and its safety
 *    argument is "item→station assignments are made later in the menu editor,
 *    not during onboarding". That holds only while the wizard is unfinished; a
 *    completed venue re-entering would null every assignment made since.
 *
 * /onboarding already sends completed venues to the dashboard — this closes the
 * same door on the step routes, which nothing links to but which stay directly
 * addressable. Deliberately NOT used by /onboarding/details: that step CREATES a
 * venue and the sidebar's "Add location" points straight at it, so a completed
 * CURRENT venue is the normal case there and guarding it would break adding a
 * second location. createVenueFromOnboarding sets the selected-venue cookie to
 * the NEW venue before redirecting into step 2, so the guard below then resolves
 * the new (incomplete) venue rather than the completed one it came from.
 */
export async function requireWizardVenue(): Promise<Venue> {
  const venue = await requireVenuePermission("settings:manage");
  if (isOnboardingComplete(venue)) {
    redirect("/dashboard");
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
