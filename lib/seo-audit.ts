import type { InferSelectModel } from "drizzle-orm";

import type {
  menuCategories,
  menuItems,
  venues,
  SeoAuditCategoryKey,
  SeoAuditCheck,
  SeoAuditIssue,
  SeoAuditSeverity,
} from "@/lib/db/schema";
import { GOOD_SCORE, OK_SCORE, WEAK_DESCRIPTION_MIN_CHARS } from "@/lib/menu-health";

/* -------------------------------------------------------------------------- */
/*  SEO & AEO audit — pure, read-only computation                              */
/*                                                                            */
/*  Scores how well a venue's PUBLIC storefront is set up for classic search   */
/*  (SEO) and for AI answer engines (AEO), from data the dashboard already     */
/*  loads: the venue row plus its venue-scoped item/category lists. Pure like  */
/*  lib/menu-health.ts — no database, no env, no AI — so the score is           */
/*  deterministic and unit-testable. The optional LLM layer (seo-audit-llm.ts) */
/*  only ever ADDS copy and recommendations; it never moves this number.       */
/*                                                                            */
/*  Every check mirrors a real emission rule of the public storefront:         */
/*  app/[slug]/page.tsx (metadata), app/[slug]/json-ld.tsx (Restaurant graph), */
/*  and app/sitemap.ts (live-venue inclusion) — so a passing audit means the   */
/*  page actually ships the markup, not that a box was ticked.                 */
/* -------------------------------------------------------------------------- */

type MenuItem = InferSelectModel<typeof menuItems>;
type MenuCategory = InferSelectModel<typeof menuCategories>;
type Venue = InferSelectModel<typeof venues>;

/** The venue fields the audit reads (full Venue rows satisfy this shape). */
export type AuditVenue = Pick<
  Venue,
  | "name"
  | "slug"
  | "venueType"
  | "storefrontDescription"
  | "streetAddress"
  | "suburb"
  | "state"
  | "postcode"
  | "phone"
  | "openingHours"
  | "latitude"
  | "longitude"
  | "logoUrl"
  | "coverUrl"
  | "onboardingCompletedAt"
  | "instagramUrl"
  | "facebookUrl"
  | "xUrl"
  | "youtubeUrl"
  | "tiktokUrl"
  | "linkedinUrl"
  | "websiteUrl"
>;

/** The item/category fields the audit reads (full rows satisfy these). */
export type AuditMenuItem = Pick<
  MenuItem,
  "id" | "name" | "description" | "imageUrl" | "priceCents" | "isAvailable" | "categoryId"
>;
export type AuditMenuCategory = Pick<MenuCategory, "id" | "name">;

/** Same bands + thresholds as menu health, so scores read consistently. */
export const SEO_GOOD_SCORE = GOOD_SCORE;
export const SEO_OK_SCORE = OK_SCORE;

/** Description length that gives search/AI enough to summarise a venue. */
export const DESCRIPTION_DEPTH_MIN_CHARS = 70;
/** Google's usual snippet window; outside it the text is often rewritten. */
export const META_DESCRIPTION_MIN = 70;
export const META_DESCRIPTION_MAX = 160;
/** Item-coverage thresholds (fractions of AVAILABLE items). */
export const DESCRIBED_ITEMS_TARGET = 0.7;
export const PHOTOGRAPHED_ITEMS_TARGET = 0.5;
export const AEO_DESCRIBED_ITEMS_TARGET = 0.5;
/** Priced items needed before a price range is honestly derivable. */
export const PRICE_RANGE_MIN_ITEMS = 5;
/** Structured-data blocks (of 6) required to pass machine coverage. */
export const STRUCTURED_BLOCKS_TARGET = 5;

export type SeoAuditBand = "good" | "ok" | "poor";
export type SeoAuditKindValue = "seo" | "aeo";

export interface SeoAuditCategorySummary {
  key: SeoAuditCategoryKey;
  label: string;
  /** 0–100: weighted share of this category's applicable checks that pass. */
  pct: number;
}

export interface SeoAuditReport {
  kind: SeoAuditKindValue;
  score: number;
  band: SeoAuditBand;
  checks: SeoAuditCheck[];
  /** Failed applicable checks, severity-ordered (high first). */
  issues: SeoAuditIssue[];
  categories: SeoAuditCategorySummary[];
}

/**
 * The canonical diner questions the AEO audit measures against — also fed to
 * the LLM Q&A simulation so the two layers grade the same exam.
 */
export const AEO_QUESTIONS = [
  "What kind of place is this?",
  "Where is it?",
  "When is it open?",
  "What can I eat there?",
  "What does it roughly cost?",
  "Can I order online right now?",
] as const;

const CATEGORY_LABEL: Record<SeoAuditCategoryKey, string> = {
  profile: "Business profile",
  menu: "Menu content",
  discoverability: "Discoverability",
  answerability: "Answerability",
  machine: "Machine readability",
};

const SEVERITY_RANK: Record<SeoAuditSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/** Storefront slug shape that makes a clean URL: lowercase kebab, ≤40 chars. */
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

const trimLen = (value: string | null): number => value?.trim().length ?? 0;
const isSet = (value: string | null): boolean => trimLen(value) > 0;

/**
 * The description search engines actually see: the page metadata falls back to
 * "Order online from <name>." when no storefront description is set (see
 * app/[slug]/page.tsx). The audit measures the SAME effective string.
 */
export function effectiveMetaDescription(venue: AuditVenue): string {
  const description = venue.storefrontDescription?.trim();
  return description && description.length > 0
    ? description
    : `Order online from ${venue.name}.`;
}

function socialLinks(venue: AuditVenue): string[] {
  return [
    venue.instagramUrl,
    venue.facebookUrl,
    venue.xUrl,
    venue.youtubeUrl,
    venue.tiktokUrl,
    venue.linkedinUrl,
    venue.websiteUrl,
  ].filter((url): url is string => isSet(url));
}

function hasFullAddress(venue: AuditVenue): boolean {
  return (
    isSet(venue.streetAddress) &&
    isSet(venue.suburb) &&
    isSet(venue.state) &&
    isSet(venue.postcode)
  );
}

function hasGeo(venue: AuditVenue): boolean {
  return venue.latitude !== null && venue.longitude !== null;
}

function hasHours(venue: AuditVenue): boolean {
  return (venue.openingHours?.length ?? 0) > 0;
}

/**
 * The six optional blocks of the storefront's Restaurant JSON-LD, with the
 * SAME emission conditions as app/[slug]/json-ld.tsx (address emits when any
 * part is set; geo needs both coordinates). Each carries the dashboard page
 * that fills it, so a coverage failure deep-links the top missing block.
 */
export function structuredDataBlocks(
  venue: AuditVenue,
  availableItems: readonly AuditMenuItem[],
): { key: string; label: string; present: boolean; fixHref: string }[] {
  const anyAddressPart =
    isSet(venue.streetAddress) ||
    isSet(venue.suburb) ||
    isSet(venue.state) ||
    isSet(venue.postcode);
  return [
    { key: "logo", label: "logo", present: isSet(venue.logoUrl), fixHref: "/dashboard/settings/logo" },
    { key: "phone", label: "phone", present: isSet(venue.phone), fixHref: "/dashboard/settings/hours" },
    { key: "address", label: "address", present: anyAddressPart, fixHref: "/dashboard/settings/hours" },
    { key: "geo", label: "map pin", present: hasGeo(venue), fixHref: "/dashboard/settings/hours" },
    { key: "hours", label: "opening hours", present: hasHours(venue), fixHref: "/dashboard/settings/hours" },
    { key: "menu", label: "menu", present: availableItems.length > 0, fixHref: "/dashboard/menu" },
  ];
}

/* -------------------------------------------------------------------------- */
/* Check builder + shared scoring                                              */
/* -------------------------------------------------------------------------- */

type CheckSpec = {
  id: string;
  label: string;
  category: SeoAuditCategoryKey;
  weight: number;
  severity: SeoAuditSeverity;
  passed: boolean;
  /** Default true; inapplicable checks leave both numerator and denominator. */
  applicable?: boolean;
  /** Owner-facing explanation of the gap + why it matters (shown on failure). */
  detail: string;
  fixHref: string | null;
};

function toCheck(spec: CheckSpec): SeoAuditCheck {
  return {
    id: spec.id,
    label: spec.label,
    category: spec.category,
    weight: spec.weight,
    severity: spec.severity,
    passed: spec.passed,
    applicable: spec.applicable ?? true,
    detail: spec.detail,
    fixHref: spec.fixHref,
  };
}

function buildReport(kind: SeoAuditKindValue, checks: SeoAuditCheck[]): SeoAuditReport {
  const applicable = checks.filter((c) => c.applicable);
  const totalWeight = applicable.reduce((sum, c) => sum + c.weight, 0);
  const passedWeight = applicable
    .filter((c) => c.passed)
    .reduce((sum, c) => sum + c.weight, 0);
  const score =
    totalWeight === 0 ? 0 : Math.round((100 * passedWeight) / totalWeight);
  const band: SeoAuditBand =
    score >= SEO_GOOD_SCORE ? "good" : score >= SEO_OK_SCORE ? "ok" : "poor";

  const issues: SeoAuditIssue[] = applicable
    .filter((c) => !c.passed)
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
        b.weight - a.weight,
    )
    .map((c) => ({
      checkId: c.id,
      severity: c.severity,
      title: c.label,
      detail: c.detail,
      fixHref: c.fixHref,
    }));

  // Per-category weighted pass share, over applicable checks only. A category
  // with nothing applicable is dropped rather than shown as a hollow 100.
  const categories: SeoAuditCategorySummary[] = [];
  for (const key of Object.keys(CATEGORY_LABEL) as SeoAuditCategoryKey[]) {
    const inCategory = applicable.filter((c) => c.category === key);
    if (inCategory.length === 0) continue;
    const catTotal = inCategory.reduce((sum, c) => sum + c.weight, 0);
    const catPassed = inCategory
      .filter((c) => c.passed)
      .reduce((sum, c) => sum + c.weight, 0);
    categories.push({
      key,
      label: CATEGORY_LABEL[key],
      pct: catTotal === 0 ? 0 : Math.round((100 * catPassed) / catTotal),
    });
  }

  return { kind, score, band, checks, issues, categories };
}

/** Shared menu derivations both audits need. */
function menuFacts(items: readonly AuditMenuItem[], categories: readonly AuditMenuCategory[]) {
  const available = items.filter((item) => item.isAvailable);
  const described = available.filter(
    (item) => trimLen(item.description) >= WEAK_DESCRIPTION_MIN_CHARS,
  );
  const photographed = available.filter((item) => isSet(item.imageUrl));
  const priced = available.filter((item) => item.priceCents > 0);

  const itemsByCategory = new Map<string, number>();
  for (const item of available) {
    itemsByCategory.set(item.categoryId, (itemsByCategory.get(item.categoryId) ?? 0) + 1);
  }
  const populatedCategories = categories.filter(
    (category) => (itemsByCategory.get(category.id) ?? 0) > 0,
  );

  const seenNames = new Set<string>();
  let hasDuplicateNames = false;
  for (const item of available) {
    const norm = item.name.trim().toLowerCase();
    if (norm.length === 0) continue;
    if (seenNames.has(norm)) {
      hasDuplicateNames = true;
      break;
    }
    seenNames.add(norm);
  }

  return { available, described, photographed, priced, populatedCategories, hasDuplicateNames };
}

const pctOf = (part: number, whole: number): number =>
  whole === 0 ? 0 : part / whole;

/* -------------------------------------------------------------------------- */
/* SEO audit — classic search readiness. Weights sum to exactly 100.           */
/* -------------------------------------------------------------------------- */

export function computeSeoAudit(
  venue: AuditVenue,
  items: readonly AuditMenuItem[],
  categories: readonly AuditMenuCategory[],
): SeoAuditReport {
  const facts = menuFacts(items, categories);
  const hasMenu = facts.available.length > 0;
  const metaDescription = effectiveMetaDescription(venue);
  const nameLength = venue.name.trim().length;

  const checks: SeoAuditCheck[] = [
    // --- Business profile (45) ---
    toCheck({
      id: "description_present",
      label: "Storefront description",
      category: "profile",
      weight: 8,
      severity: "high",
      passed: trimLen(venue.storefrontDescription) >= WEAK_DESCRIPTION_MIN_CHARS,
      detail:
        "Your storefront has no real description. Google shows this text in search results; write a couple of sentences about what you serve.",
      fixHref: "/dashboard/settings/about",
    }),
    toCheck({
      id: "description_depth",
      label: "Description depth",
      category: "profile",
      weight: 4,
      severity: "medium",
      passed: trimLen(venue.storefrontDescription) >= DESCRIPTION_DEPTH_MIN_CHARS,
      detail: `Your description is short. ${DESCRIPTION_DEPTH_MIN_CHARS}+ characters gives search and AI assistants enough to summarise you well.`,
      fixHref: "/dashboard/settings/about",
    }),
    toCheck({
      id: "address_complete",
      label: "Full street address",
      category: "profile",
      weight: 8,
      severity: "high",
      passed: hasFullAddress(venue),
      detail:
        "Street, suburb, state and postcode are all needed before your address appears in search and map listings.",
      fixHref: "/dashboard/settings/hours",
    }),
    toCheck({
      id: "phone_present",
      label: "Phone number",
      category: "profile",
      weight: 4,
      severity: "medium",
      passed: isSet(venue.phone),
      detail:
        "No phone number set. It appears in your search listing and lets customers (and Google) verify you.",
      fixHref: "/dashboard/settings/hours",
    }),
    toCheck({
      id: "hours_present",
      label: "Opening hours",
      category: "profile",
      weight: 8,
      severity: "high",
      passed: hasHours(venue),
      detail:
        "No opening hours set. Search results and AI assistants can't answer \"is it open?\" without them.",
      fixHref: "/dashboard/settings/hours",
    }),
    toCheck({
      id: "geo_present",
      label: "Map coordinates",
      category: "profile",
      weight: 4,
      severity: "medium",
      passed: hasGeo(venue),
      detail:
        "No map pin set. Coordinates place your venue in \"near me\" searches and map packs.",
      fixHref: "/dashboard/settings/hours",
    }),
    toCheck({
      id: "logo_present",
      label: "Logo",
      category: "profile",
      weight: 4,
      severity: "medium",
      passed: isSet(venue.logoUrl),
      detail:
        "No logo uploaded. It shows next to your name in search results and share cards.",
      fixHref: "/dashboard/settings/logo",
    }),
    toCheck({
      id: "cover_present",
      label: "Cover photo",
      category: "profile",
      weight: 5,
      severity: "medium",
      passed: isSet(venue.coverUrl),
      detail:
        "No cover photo. Links shared to social and chat apps fall back to a plain card without one.",
      fixHref: "/dashboard/settings/imagery",
    }),

    // --- Menu content (30) ---
    toCheck({
      id: "menu_present",
      label: "Menu online",
      category: "menu",
      weight: 10,
      severity: "high",
      passed: hasMenu,
      detail:
        "Your storefront has no available menu items, so search engines have nothing to list for you.",
      fixHref: "/dashboard/menu",
    }),
    toCheck({
      id: "menu_descriptions",
      label: "Item descriptions",
      category: "menu",
      weight: 8,
      severity: "medium",
      applicable: hasMenu,
      passed:
        pctOf(facts.described.length, facts.available.length) >=
        DESCRIBED_ITEMS_TARGET,
      detail: `Fewer than ${Math.round(DESCRIBED_ITEMS_TARGET * 100)}% of your items have a real description. Descriptions are what search snippets and AI answers quote.`,
      fixHref: "/dashboard/menu/descriptions",
    }),
    toCheck({
      id: "menu_photos",
      label: "Item photos",
      category: "menu",
      weight: 6,
      severity: "medium",
      applicable: hasMenu,
      passed:
        pctOf(facts.photographed.length, facts.available.length) >=
        PHOTOGRAPHED_ITEMS_TARGET,
      detail:
        "Fewer than half of your items have a photo. Photo-rich menus rank and convert better.",
      fixHref: "/dashboard/media",
    }),
    toCheck({
      id: "menu_structure",
      label: "Menu sections",
      category: "menu",
      weight: 3,
      severity: "low",
      applicable: hasMenu,
      passed: facts.populatedCategories.length >= 2,
      detail:
        "Your menu has fewer than two populated categories. Sections help crawlers (and customers) understand it.",
      fixHref: "/dashboard/menu",
    }),
    toCheck({
      id: "menu_duplicate_free",
      label: "No duplicate item names",
      category: "menu",
      weight: 3,
      severity: "low",
      applicable: hasMenu,
      passed: !facts.hasDuplicateNames,
      detail:
        "Some items share the same name, which reads as duplicate content to crawlers and confuses recommendations.",
      fixHref: "/dashboard/menu",
    }),

    // --- Discoverability (25) ---
    toCheck({
      id: "venue_live",
      label: "Listed in the sitemap",
      category: "discoverability",
      weight: 10,
      severity: "high",
      passed: venue.onboardingCompletedAt !== null,
      detail:
        "Your venue isn't live yet, so it's excluded from the sitemap and search engines aren't told it exists.",
      fixHref: "/onboarding",
    }),
    toCheck({
      id: "meta_description_fit",
      label: "Search snippet length",
      category: "discoverability",
      weight: 5,
      severity: "medium",
      passed:
        metaDescription.length >= META_DESCRIPTION_MIN &&
        metaDescription.length <= META_DESCRIPTION_MAX,
      detail: `The text Google shows under your link is ${metaDescription.length} characters; ${META_DESCRIPTION_MIN}–${META_DESCRIPTION_MAX} is the sweet spot before Google rewrites it.`,
      fixHref: "/dashboard/settings/about",
    }),
    toCheck({
      id: "name_title_fit",
      label: "Page title length",
      category: "discoverability",
      weight: 2,
      severity: "low",
      passed: nameLength >= 2 && nameLength <= 60,
      detail:
        "Your venue name is unusually long or short for a browser/search title, so it may be truncated.",
      fixHref: null,
    }),
    toCheck({
      id: "slug_quality",
      label: "Clean web address",
      category: "discoverability",
      weight: 3,
      severity: "low",
      passed: SLUG_PATTERN.test(venue.slug) && !/^\d+$/.test(venue.slug),
      detail:
        "Your storefront address isn't a clean lowercase slug, which makes a weaker URL. (Set at onboarding — contact support to change it.)",
      fixHref: null,
    }),
    toCheck({
      id: "social_links",
      label: "Social & website links",
      category: "discoverability",
      weight: 5,
      severity: "low",
      passed: socialLinks(venue).length > 0,
      detail:
        "No social or website links set. They connect your storefront to your brand elsewhere on the web.",
      fixHref: "/dashboard/settings/social",
    }),
  ];

  return buildReport("seo", checks);
}

/* -------------------------------------------------------------------------- */
/* AEO audit — AI-answerability. Weights sum to exactly 100.                   */
/*                                                                            */
/* Each answerability check maps to one canonical diner question an assistant  */
/* should be able to answer from the venue's OWN structured data (never a      */
/* guess). Machine checks grade how much of that data ships as JSON-LD.        */
/* -------------------------------------------------------------------------- */

export function computeAeoAudit(
  venue: AuditVenue,
  items: readonly AuditMenuItem[],
  categories: readonly AuditMenuCategory[],
): SeoAuditReport {
  const facts = menuFacts(items, categories);
  const hasMenu = facts.available.length > 0;
  const blocks = structuredDataBlocks(venue, facts.available);
  const presentBlocks = blocks.filter((block) => block.present);
  const missingBlocks = blocks.filter((block) => !block.present);
  // Enough priced items for an honest range: all of them when the menu is
  // small, PRICE_RANGE_MIN_ITEMS once it's big enough for a spread.
  const pricedTarget = Math.min(PRICE_RANGE_MIN_ITEMS, facts.available.length);

  const checks: SeoAuditCheck[] = [
    // --- Answerability (70) ---
    toCheck({
      id: "aeo_what",
      label: `Answers "${AEO_QUESTIONS[0]}"`,
      category: "answerability",
      weight: 10,
      severity: "high",
      passed:
        venue.venueType !== null ||
        trimLen(venue.storefrontDescription) >= 50,
      detail:
        "An assistant can't tell what kind of place you are. Pick a venue type or write a fuller description.",
      fixHref: "/dashboard/settings/about",
    }),
    toCheck({
      id: "aeo_where",
      label: `Answers "${AEO_QUESTIONS[1]}"`,
      category: "answerability",
      weight: 12,
      severity: "high",
      passed: hasFullAddress(venue) || hasGeo(venue),
      detail:
        "An assistant can't answer \"where is it?\". Add your full address or map coordinates.",
      fixHref: "/dashboard/settings/hours",
    }),
    toCheck({
      id: "aeo_when",
      label: `Answers "${AEO_QUESTIONS[2]}"`,
      category: "answerability",
      weight: 12,
      severity: "high",
      passed: hasHours(venue),
      detail:
        "An assistant can't answer \"is it open now?\". Add your opening hours.",
      fixHref: "/dashboard/settings/hours",
    }),
    toCheck({
      id: "aeo_menu",
      label: `Answers "${AEO_QUESTIONS[3]}"`,
      category: "answerability",
      weight: 12,
      severity: "high",
      passed: hasMenu,
      detail:
        "An assistant can't answer \"what can I eat there?\". Add available menu items.",
      fixHref: "/dashboard/menu",
    }),
    toCheck({
      id: "aeo_price",
      label: `Answers "${AEO_QUESTIONS[4]}"`,
      category: "answerability",
      weight: 8,
      severity: "medium",
      applicable: hasMenu,
      passed: facts.priced.length >= pricedTarget && facts.priced.length > 0,
      detail:
        "Too few items have a price, so an assistant can't state an honest price range.",
      fixHref: "/dashboard/menu",
    }),
    toCheck({
      id: "aeo_order",
      label: `Answers "${AEO_QUESTIONS[5]}"`,
      category: "answerability",
      weight: 10,
      severity: "high",
      passed: venue.onboardingCompletedAt !== null,
      detail:
        "Your venue isn't live, so an assistant can't point people here to order.",
      fixHref: "/onboarding",
    }),
    toCheck({
      id: "aeo_contact",
      label: "Contact details on record",
      category: "answerability",
      weight: 6,
      severity: "medium",
      passed: isSet(venue.phone) || socialLinks(venue).length > 0,
      detail:
        "No phone or links set — an assistant can't tell people how to reach you.",
      fixHref: "/dashboard/settings/hours",
    }),

    // --- Machine readability (30) ---
    toCheck({
      id: "aeo_structured_coverage",
      label: "Structured data coverage",
      category: "machine",
      weight: 12,
      severity: "high",
      passed: presentBlocks.length >= STRUCTURED_BLOCKS_TARGET,
      detail: `Your page emits ${presentBlocks.length} of ${blocks.length} structured-data blocks (${blocks.map((b) => b.label).join(", ")}). Assistants read these directly${missingBlocks.length > 0 ? `; missing: ${missingBlocks.map((b) => b.label).join(", ")}` : ""}.`,
      fixHref: missingBlocks[0]?.fixHref ?? null,
    }),
    toCheck({
      id: "aeo_menu_descriptions",
      label: "Menu items described",
      category: "machine",
      weight: 8,
      severity: "medium",
      applicable: hasMenu,
      passed:
        pctOf(facts.described.length, facts.available.length) >=
        AEO_DESCRIBED_ITEMS_TARGET,
      detail:
        "Half or more of your items need descriptions before an assistant can answer \"what's good here?\".",
      fixHref: "/dashboard/menu/descriptions",
    }),
    toCheck({
      id: "aeo_entity_links",
      label: "Linked to the wider web",
      category: "machine",
      weight: 5,
      severity: "low",
      passed: socialLinks(venue).length > 0,
      detail:
        "No social or website links. sameAs links help assistants confirm your venue is the real one.",
      fixHref: "/dashboard/settings/social",
    }),
    toCheck({
      id: "aeo_identity_images",
      label: "Logo + cover photo",
      category: "machine",
      weight: 5,
      severity: "low",
      passed: isSet(venue.logoUrl) && isSet(venue.coverUrl),
      detail:
        "Add both a logo and a cover photo so assistants and link previews can show your brand.",
      fixHref: "/dashboard/settings/imagery",
    }),
  ];

  return buildReport("aeo", checks);
}
