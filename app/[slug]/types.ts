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
