import type { InferSelectModel } from "drizzle-orm";

import type { venues } from "@/lib/db/schema";

/**
 * Google Business Profile checklist (docs/seo/GMB_PLAYBOOK.md, surfaced as the
 * card on /dashboard/seo). Two kinds of item: STOREFRONT items are derived from
 * the venue's own data (the profile must mirror them, so having them on the
 * storefront is the prerequisite); MANUAL items happen on Google and the owner
 * ticks them off, persisted as a list of keys on the venue. Pure and tested.
 */

export type GmbChecklistVenue = Pick<
  InferSelectModel<typeof venues>,
  | "slug"
  | "streetAddress"
  | "suburb"
  | "postcode"
  | "phone"
  | "openingHours"
  | "logoUrl"
  | "coverUrl"
>;

export type GmbChecklistItem = {
  key: string;
  title: string;
  detail: string;
  done: boolean;
  source: "storefront" | "manual";
  /** Dashboard page that fixes a storefront item; null for manual items. */
  href: string | null;
};

const isSet = (value: string | null | undefined): boolean =>
  typeof value === "string" && value.trim().length > 0;

type StorefrontItem = {
  key: string;
  title: string;
  detail: string;
  href: string;
  done: (venue: GmbChecklistVenue) => boolean;
};

const STOREFRONT_ITEMS: readonly StorefrontItem[] = [
  {
    key: "address",
    title: "Address on your storefront",
    detail:
      "Google cross-checks the profile against your website. Use exactly this address on the profile.",
    href: "/dashboard/settings/hours",
    done: (venue) =>
      isSet(venue.streetAddress) && isSet(venue.suburb) && isSet(venue.postcode),
  },
  {
    key: "phone",
    title: "Phone number on your storefront",
    detail: "The same number, formatted the same way, everywhere it appears.",
    href: "/dashboard/settings/hours",
    done: (venue) => isSet(venue.phone),
  },
  {
    key: "hours",
    title: "Opening hours on your storefront",
    detail:
      "Match the profile's hours to these exactly, and update both together for holidays.",
    href: "/dashboard/settings/hours",
    done: (venue) => Array.isArray(venue.openingHours) && venue.openingHours.length > 0,
  },
  {
    key: "brand",
    title: "Logo and cover photo uploaded",
    detail: "Reuse the same logo and cover on the profile so the listing matches the storefront.",
    href: "/dashboard/settings/logo",
    done: (venue) => isSet(venue.logoUrl) && isSet(venue.coverUrl),
  },
];

type ManualItem = { key: string; title: string; detail: (storefrontUrl: string) => string };

const MANUAL_ITEMS: readonly ManualItem[] = [
  {
    key: "claimed",
    title: "Claim and verify the profile",
    detail: () =>
      "At business.google.com, claim the existing listing (or create one) and complete verification.",
  },
  {
    key: "category",
    title: "Set the most specific primary category",
    detail: () =>
      "“Café” or “Pizza restaurant”, not “Restaurant”. Add relevant secondary categories.",
  },
  {
    key: "website",
    title: "Website link points at your storefront",
    detail: (url) => `Set the profile's website to ${url} so searchers land where they can order.`,
  },
  {
    key: "order_link",
    title: "Menu and “Order online” links added",
    detail: (url) => `Add ${url} as both the menu link and the order link on the profile.`,
  },
  {
    key: "photos",
    title: "Real photos of the food, the room and the front",
    detail: () => "Add a first batch now and a few new ones each month — fresh photos rank better.",
  },
  {
    key: "reviews",
    title: "Replying to every review",
    detail: () =>
      "Ask happy customers for a review and reply to all of them, good and bad, within a few days.",
  },
  {
    key: "posts",
    title: "Posting specials and events",
    detail: () => "A Google Post a month (specials, seasonal menu, events) keeps the listing active.",
  },
];

const MANUAL_KEYS = new Set(MANUAL_ITEMS.map((item) => item.key));

/** Persisted keys → the valid, de-duplicated manual keys (bad data is dropped). */
export function normaliseGmbChecklist(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const value of raw) {
    if (typeof value === "string" && MANUAL_KEYS.has(value)) seen.add(value);
  }
  return [...seen];
}

/** Flip one manual key; null when the key is not a manual item. */
export function toggleGmbChecklistKey(current: readonly string[], key: string): string[] | null {
  if (!MANUAL_KEYS.has(key)) return null;
  const next = normaliseGmbChecklist([...current]);
  return next.includes(key) ? next.filter((k) => k !== key) : [...next, key];
}

export function buildGmbChecklist(
  venue: GmbChecklistVenue,
  storefrontUrl: string,
  completed: readonly string[],
): { items: GmbChecklistItem[]; done: number; total: number } {
  const ticked = new Set(normaliseGmbChecklist([...completed]));
  const items: GmbChecklistItem[] = [
    ...STOREFRONT_ITEMS.map((item) => ({
      key: item.key,
      title: item.title,
      detail: item.detail,
      done: item.done(venue),
      source: "storefront" as const,
      href: item.href,
    })),
    ...MANUAL_ITEMS.map((item) => ({
      key: item.key,
      title: item.title,
      detail: item.detail(storefrontUrl),
      done: ticked.has(item.key),
      source: "manual" as const,
      href: null,
    })),
  ];
  return {
    items,
    done: items.filter((item) => item.done).length,
    total: items.length,
  };
}
