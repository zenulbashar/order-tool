/**
 * Storefront cache tags (M6 / audit F6).
 *
 * The diner storefront re-queried the full menu on EVERY pageview, so compute
 * and database load scaled with diner traffic instead of with menu changes —
 * the finding calls this the primary obstacle to scale. The fix is to cache
 * the payload and invalidate it by TAG on every mutation, which keeps the
 * property `force-dynamic` was chosen for in the first place: 86-ing an item
 * is visible immediately, not after a TTL.
 *
 * Pure string builders, deliberately in their own module with no imports, so
 * the producing side (unstable_cache in app/[slug]/queries.ts) and every
 * consuming mutation refer to the SAME tag by construction. A typo'd tag is
 * the failure mode that ships stale menus, so there is exactly one source.
 */

/**
 * Everything a diner sees that comes from the venue's menu: categories,
 * items, variants, modifier groups/options, tags, and availability.
 */
export function venueMenuTag(venueId: string): string {
  return `venue:${venueId}:menu`;
}

/**
 * The venue's own storefront profile: name, brand, hours, address, about,
 * announcement, social links, FAQs — anything rendered around the menu.
 */
export function venueProfileTag(venueId: string): string {
  return `venue:${venueId}:profile`;
}

/**
 * The slug→venue resolution itself. Keyed by SLUG because that lookup happens
 * before the venue id is known. Safe to cache: a slug is written once during
 * onboarding and is never updated afterwards, so a cached entry can never
 * point at the wrong venue.
 */
export function venueSlugTag(slug: string): string {
  return `venue-slug:${slug.trim().toLowerCase()}`;
}

/**
 * Every tag covering what a diner sees for one venue. Most dashboard
 * mutations can't cheaply say which side they touched (a settings save may
 * change hours AND branding), and over-invalidating costs one rebuild while
 * under-invalidating ships a stale menu — so the default is to clear all.
 */
export function venueStorefrontTags(venue: {
  id: string;
  slug: string;
}): string[] {
  return [
    venueMenuTag(venue.id),
    venueProfileTag(venue.id),
    venueSlugTag(venue.slug),
  ];
}
