import type { OpeningHoursEntry } from "@/lib/db/schema";
import type { DietaryTag } from "@/lib/validation";

/**
 * Customer-safe shapes for the public storefront. These deliberately omit
 * venue_id, owner identity, timestamps, and any unpublished rows — only what
 * the browse + cart UI needs. Shared between the server (queries) and the
 * client storefront components.
 */
export type PublicVenue = {
  id: string;
  slug: string;
  name: string;
  brandColor: string;
  // Optional venue text colour (two-colour theming). Null = automatic — the
  // diner root only overrides --color-ink when this is set.
  textColor: string | null;
  // Owner-authored promo bar text (null = hidden) + social profile links for the
  // footer "Follow us" row. Each nullable; any subset can be set.
  announcement: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  xUrl: string | null;
  youtubeUrl: string | null;
  tiktokUrl: string | null;
  linkedinUrl: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
  // Owner-uploaded storefront brand imagery. coverUrl replaces the storefront's
  // brand-colour cover band with a hero image; backgroundUrl fills the empty
  // side gutters (behind the centered column) on wide screens across all diner
  // pages. Both null by default — the storefront looks exactly as before.
  coverUrl: string | null;
  // Hero rotation slots 2 & 3 (desktop). The storefront rotates through the
  // non-null of [coverUrl, coverUrl2, coverUrl3]; mobile uses coverUrl alone.
  coverUrl2: string | null;
  coverUrl3: string | null;
  backgroundUrl: string | null;
  storefrontDescription: string | null;
  // Structured-data inputs (Phase 6). Public by design — they power the venue's
  // search listing via JSON-LD (see json-ld.tsx). Any field may be null, and
  // the markup emits ONLY the parts that are set; nothing here is fabricated.
  streetAddress: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
  phone: string | null;
  openingHours: OpeningHoursEntry[] | null;
  latitude: number | null;
  longitude: number | null;
  // Scheduled-pickup config (Phase 8). timezone + openingHours let the client
  // build venue-local pickup slots; the server re-validates authoritatively.
  // The picker is offered only when schedulingEnabled && openingHours is set.
  timezone: string;
  schedulingEnabled: boolean;
  schedulingLeadMinutes: number;
  schedulingMaxDaysAhead: number;
  // Pay-by-bank saving (Track B · 3b-ii). Display only — the checkout shows a
  // "Save $X paying by bank" callout; the discount is server-recomputed and
  // applied to the PaymentIntent at pay time, never trusted from the client.
  paytoEnabled: boolean;
  paytoDiscountMode: "off" | "flat" | "percent";
  paytoDiscountValue: number;
  // Customer loyalty/points (PR1 exposes config; redemption is a later build).
  // Display + client-recompute inputs only — earning/redeeming are always
  // server-authoritative, never trusted from the client.
  loyaltyEnabled: boolean;
  loyaltyEarnRatePerDollar: number;
  loyaltyRedeemValueCents: number;
  loyaltyMinRedeemPoints: number;
  // GST/sales tax (inclusive) — display only. The checkout summary + receipt show
  // "incl. GST $X" (the tax portion already inside the price); the charge is never
  // affected. taxRateBps is basis points (1000 = 10%); taxLabel defaults to "GST".
  taxEnabled: boolean;
  taxRateBps: number;
  taxLabel: string;
  // Whether the venue has finished onboarding and is live (Phase 3c). A DERIVED
  // boolean (onboarding_completed_at !== null) — never the raw timestamp — so the
  // storefront can show a graceful "not taking orders yet" state. The server-side
  // placeOrder gate is the authoritative block; this only drives presentation.
  isLive: boolean;
};

export type PublicOption = {
  id: string;
  name: string;
  priceDeltaCents: number;
};

/**
 * One size variant of an item (Phase 5b). Customer-safe: id + name + the
 * variant's OWN absolute price; no venue_id or timestamps. When an item has >= 1
 * of these it is variant-priced and these are the authoritative price source —
 * the item's base priceCents is ignored for it (the EITHER flat OR variant rule).
 */
export type PublicVariant = {
  id: string;
  name: string;
  priceCents: number;
};

export type PublicGroup = {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: PublicOption[];
};

export type PublicItem = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  imageUrl: string | null;
  // Size variants in sort_order (Phase 5b). EMPTY for a flat-priced item, which
  // then behaves exactly as before (priceCents is the price). When non-empty the
  // item is variant-priced: the storefront shows "from $<min>", makes the
  // customer pick a size, and prices from the chosen variant — never priceCents.
  variants: PublicVariant[];
  // Owner-set dietary/allergen tags (canonical order). Customer-safe: tag
  // strings only — no venue_id or timestamps. A guide, never a guarantee; the
  // storefront shows the confirm-with-the-venue disclaimer alongside them.
  tags: DietaryTag[];
  groups: PublicGroup[];
};

export type PublicCategory = {
  id: string;
  name: string;
  description: string | null;
  items: PublicItem[];
};

export type PublicMenu = PublicCategory[];

/**
 * Aggregate, venue-scoped "frequently bought together" signal (#11). Customer-
 * safe by construction: ONLY public menu-item ids + one boolean — never a
 * venue_id, timestamp, customer, snapshot, or raw sales count. Computed read-only
 * from this venue's CONFIRMED orders' order_items soft refs (see
 * getRecommendations); the client resolves these ids to PublicItem from the menu
 * it already holds, applies the in-cart exclusion + 2–4 cap at render, and hides
 * every surface when hasHistory is false (cold-start). Nothing crosses venues.
 */
export type PublicRecommendations = {
  // anchor item id -> co-occurring item ids, strongest first. Already limited to
  // currently available + active items, with the anchor and weak pairs dropped.
  byItem: Record<string, string[]>;
  // Popularity fallback: available + active item ids, most-ordered first.
  popular: string[];
  // True only when the venue has enough confirmed-order history to recommend.
  hasHistory: boolean;
};

/** Order type is UI state only in 2a (persisted at order time in 2b). */
export type OrderType = "pickup" | "dinein";
