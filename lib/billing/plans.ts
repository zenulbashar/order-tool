import { venuePlan } from "@/lib/db/schema";

/**
 * The SINGLE source of truth for what each billing tier unlocks (Phase 1).
 *
 * Two pieces live here and nowhere else:
 *   - FEATURES: the named, tier-differentiated capabilities.
 *   - PLAN_FEATURES: the plan -> features map.
 * Plus hasFeature(), the one gate every entitlement check routes through. Keeping
 * tier logic in this one module is what makes "change what Pro includes" a
 * one-file edit and stops plan checks from scattering across the codebase.
 *
 * This file is PURE: no I/O, no DB, no Stripe. It maps a plan (a value the caller
 * already holds) to a boolean. Reading a venue's plan from the database is a
 * separate server-only concern (see lib/billing/queries.ts). Prices are NOT here
 * either — they live in Stripe from Phase 2 on.
 *
 * Phase 1 wires only DINER_CONCIERGE (via lib/concierge.ts). The other constants
 * are DEFINED so later phases plug in without touching this map, but are NOT yet
 * enforced at their feature sites.
 */

/** A billing tier. Derived from the DB enum so the two can never drift. */
export type Plan = (typeof venuePlan.enumValues)[number];

/**
 * Named, tier-differentiated capabilities. The baseline ordering platform
 * (storefront, menu, cart, checkout, kitchen, tables, scheduling,
 * recommendations, menu health, SEO) is available to EVERY plan and so is
 * deliberately absent here — only things that actually differ by tier are gated.
 */
export const FEATURES = {
  /** Diner-facing AI ordering concierge (#12). Wired in Phase 1. */
  DINER_CONCIERGE: "diner_concierge",
  /** Owner AI tool: import a menu from photos. Defined, not yet enforced. */
  AI_MENU_IMPORT: "ai_menu_import",
  /** Owner AI tool: draft menu descriptions. Defined, not yet enforced. */
  AI_DESCRIPTIONS: "ai_descriptions",
  /** Manage more than one venue. Defined, not yet enforced. */
  MULTI_VENUE: "multi_venue",
  /** Serve the storefront on a custom domain. Defined, not yet enforced. */
  CUSTOM_DOMAIN: "custom_domain",
  /**
   * Owner SEO & AEO studio (/dashboard/seo): one-click storefront audits with
   * AI-drafted fixes + Search Console stats. The BASELINE storefront SEO
   * (JSON-LD, sitemap, metadata) stays free for every plan — only the audit
   * studio is tier-gated. Wired at app/dashboard/seo.
   */
  SEO_AEO: "seo_aeo",
} as const;

export type Feature = (typeof FEATURES)[keyof typeof FEATURES];

/**
 * Plan -> unlocked features, per the locked pricing model:
 *   - trial: Scale-level access (taste everything) for the 1-month trial.
 *   - pro:   full ordering platform + diner concierge + owner AI tools.
 *   - scale: everything in pro + multi-venue + custom domain.
 *   - free:  the LAPSED end-state (Phase 2). NO tier-differentiated features —
 *            baseline ordering only (storefront, menu, cart, checkout, kitchen,
 *            tables, scheduling, which are baseline for every plan). A venue
 *            drops here when its subscription cancels/lapses. Keeping this an
 *            empty set is what lets entitlement stay a single hasFeature() check
 *            off `plan` — no plan_status-based gating scattered anywhere.
 * (Higher fair-use caps are a LATER phase — only the feature flags live here.)
 */
const PLAN_FEATURES: Record<Plan, ReadonlySet<Feature>> = {
  trial: new Set([
    FEATURES.DINER_CONCIERGE,
    FEATURES.AI_MENU_IMPORT,
    FEATURES.AI_DESCRIPTIONS,
    FEATURES.MULTI_VENUE,
    FEATURES.CUSTOM_DOMAIN,
    FEATURES.SEO_AEO,
  ]),
  pro: new Set([
    FEATURES.DINER_CONCIERGE,
    FEATURES.AI_MENU_IMPORT,
    FEATURES.AI_DESCRIPTIONS,
  ]),
  scale: new Set([
    FEATURES.DINER_CONCIERGE,
    FEATURES.AI_MENU_IMPORT,
    FEATURES.AI_DESCRIPTIONS,
    FEATURES.MULTI_VENUE,
    FEATURES.CUSTOM_DOMAIN,
    FEATURES.SEO_AEO,
  ]),
  free: new Set<Feature>(),
};

/**
 * The entitlement gate. Pure and synchronous: given anything carrying a `plan`
 * (the owner Venue row or a server-resolved plan), return whether that plan
 * unlocks the feature. Usable from server actions, route handlers, and server
 * components. No I/O — the caller supplies the plan.
 */
export function hasFeature(
  venue: { plan: Plan },
  feature: Feature,
): boolean {
  return PLAN_FEATURES[venue.plan].has(feature);
}
