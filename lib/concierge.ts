import type { PublicVenue } from "@/app/[slug]/types";
import { FEATURES, hasFeature } from "@/lib/billing/plans";
import { getVenuePlan } from "@/lib/billing/queries";

/**
 * The SINGLE on/off seam for the diner-facing AI ordering concierge (#12).
 *
 * GATED on the venue's plan (Phase 1). The decision routes through the one
 * entitlement config: read the venue's plan server-side, then return whether
 * that plan unlocks DINER_CONCIERGE (see lib/billing/plans.ts). Because trial
 * unlocks everything and every existing venue defaults to 'trial', every current
 * venue still has the concierge — no behaviour change in practice — but flipping
 * a venue to a plan without the concierge would now correctly disable it.
 *
 * This stays the ONLY place entitlement is decided for the concierge:
 *   - the server action (app/[slug]/concierge/actions.ts) gates execution on it
 *     (never trust the client), and
 *   - the storefront (app/[slug]/page.tsx → storefront.tsx) shows/hides the
 *     prompt box on it.
 * Keeping every check funnelled through this one helper is what makes the
 * billing bolt-on a single-file change.
 *
 * The plan is read here by venue.id rather than carried on PublicVenue, so the
 * tier never serializes to the client storefront. Async (it always was, for
 * exactly this DB read) so neither call site changes. NOT a fair-use cap or
 * trial-expiry check — those are later phases; this gates on `plan` only.
 */
export async function canUseConcierge(venue: PublicVenue): Promise<boolean> {
  const plan = await getVenuePlan(venue.id);
  if (!plan) return false;
  return hasFeature({ plan }, FEATURES.DINER_CONCIERGE);
}
