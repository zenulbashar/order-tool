import type { PublicVenue } from "@/app/[slug]/types";

/**
 * The SINGLE on/off seam for the diner-facing AI ordering concierge (#12).
 *
 * UNGATED for now: this returns true for every venue, so the "prompt to eat"
 * box is available on every storefront and can be tested live on a real venue
 * before any pricing decision. The concierge deliberately ships with NO plan
 * gate, NO fair-use cap, and NO credit logic — that billing layer is separate
 * and deferred.
 *
 * This is also the ONLY place that future billing plugs in. When the Pro
 * entitlement + fair-use cap land, the decision goes HERE (read the venue's
 * plan / usage by venue.id and return false when blocked) and nowhere else:
 *   - the server action (app/[slug]/concierge/actions.ts) gates execution on it
 *     (never trust the client), and
 *   - the storefront (app/[slug]/page.tsx → storefront.tsx) shows/hides the
 *     prompt box on it.
 * Keeping every check funnelled through this one helper is what makes the
 * billing bolt-on a single-file change.
 *
 * Async from the start so a later DB / subscription read slots in without
 * touching either call site.
 */
export async function canUseConcierge(venue: PublicVenue): Promise<boolean> {
  // No entitlement logic yet — every venue can use the concierge. `venue` is
  // referenced so this seam keeps its typed input for the future billing check.
  void venue;
  return true;
}
