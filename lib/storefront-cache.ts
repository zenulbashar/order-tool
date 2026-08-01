import "server-only";

import { revalidatePath, updateTag } from "next/cache";

import { venueStorefrontTags } from "@/lib/cache-tags";

/**
 * The ONE call every dashboard mutation makes after changing anything a diner
 * sees (M6 / audit F6).
 *
 * F6's stated dependency is the dangerous part of this milestone: *"Every menu
 * mutation path must call revalidateTag — audit these together or stale menus
 * will ship."* Spreading tag calls across ~60 sites makes missing one both
 * easy and invisible, so there is a single helper, it clears BOTH tags plus
 * the storefront path, and mutation code never names a tag itself.
 *
 * WHY `updateTag` AND NOT `revalidateTag`: in this Next version
 * `revalidateTag(tag, "max")` marks data stale and serves the STALE copy
 * while refreshing in the background. For a menu that is the wrong
 * behaviour — the next diner would still be offered an item the kitchen has
 * just 86'd. `updateTag` expires immediately and makes the next request wait
 * for fresh data, which is precisely the guarantee `force-dynamic` was
 * originally chosen to provide. (The deprecated one-argument
 * `revalidateTag(tag)` would also expire immediately, but it is on its way
 * out; `updateTag` is the documented replacement.)
 *
 * `updateTag` may only be called from a Server Action. Every caller here is
 * one. A future Route Handler that mutates the menu must use
 * `revalidateTag(tag, { expire: 0 })` instead — do not silently downgrade to
 * stale-while-revalidate.
 *
 * Over-invalidating costs one cache rebuild. Under-invalidating serves a
 * diner an item that is no longer available. That asymmetry decides the
 * default: clear everything for the venue.
 */
export function revalidateStorefront(venue: {
  id: string;
  slug: string;
}): void {
  for (const tag of venueStorefrontTags(venue)) updateTag(tag);
  // The rendered route as well: the page is still per-request today, and this
  // preserves the behaviour the settings actions already relied on.
  revalidatePath(`/${venue.slug}`);
}
