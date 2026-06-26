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
  logoUrl: string | null;
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
};

export type PublicOption = {
  id: string;
  name: string;
  priceDeltaCents: number;
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

/** Order type is UI state only in 2a (persisted at order time in 2b). */
export type OrderType = "pickup" | "dinein";
