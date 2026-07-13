import "server-only";

import { getCategoriesForVenue, getItemsForVenue } from "../menu/queries";

import type { MenuArtworkData } from "./artwork";

// Raster image types we'll inline. SVG is intentionally excluded — an SVG image
// referenced inside the artwork can taint the export canvas in some browsers, so
// SVG logos/photos simply don't appear in studio artwork (they show elsewhere).
const INLINE_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
const INLINE_IMAGE_MAX_BYTES = 2 * 1024 * 1024; // 2MB
// Cap how many item photos we fetch+inline per build so a huge menu can't turn
// one Studio render into hundreds of image fetches. Beyond this, items simply
// render without a photo (the layout tolerates a mix).
const MAX_INLINED_PHOTOS = 60;

/**
 * Fetch an owner image server-side and return it as a data: URI so the artwork
 * can embed it WITHOUT tainting the client-side PNG export canvas (a remote R2
 * URL would). Bounded (3s timeout, 2MB, raster types only) and fail-soft: any
 * problem returns null and that image is simply omitted from the artwork.
 */
export async function inlineImage(url: string | null): Promise<string | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (!INLINE_IMAGE_TYPES.has(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > INLINE_IMAGE_MAX_BYTES) return null;
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Build the Studio menu categories from the venue's LIVE menu (active categories
 * + available items only, mirroring the storefront). With `withPhotos`, each
 * item's photo is inlined to a data: URI (bounded, CORS-safe) so it can be drawn
 * into the artwork without tainting the PNG export; without it, imageDataUri is
 * null and the page loads fast (photos are fetched lazily on demand).
 */
export async function buildMenuCategories(
  venueId: string,
  opts: { withPhotos: boolean },
): Promise<MenuArtworkData["categories"]> {
  const [categories, items] = await Promise.all([
    getCategoriesForVenue(venueId),
    getItemsForVenue(venueId),
  ]);

  const itemsByCategory = new Map<string, typeof items>();
  for (const item of items) {
    if (!item.isAvailable) continue; // mirror the storefront — live items only
    const list = itemsByCategory.get(item.categoryId) ?? [];
    list.push(item);
    itemsByCategory.set(item.categoryId, list);
  }

  const activeCategories = categories.filter((category) => category.isActive);

  // Inline photos once, up front, for the items that have one (bounded).
  const photoByItemId = new Map<string, string | null>();
  if (opts.withPhotos) {
    const withImage = activeCategories
      .flatMap((category) => itemsByCategory.get(category.id) ?? [])
      .filter((item) => Boolean(item.imageUrl))
      .slice(0, MAX_INLINED_PHOTOS);
    const inlined = await Promise.all(
      withImage.map(
        async (item) => [item.id, await inlineImage(item.imageUrl)] as const,
      ),
    );
    for (const [itemId, dataUri] of inlined) photoByItemId.set(itemId, dataUri);
  }

  return activeCategories
    .map((category) => ({
      name: category.name,
      items: (itemsByCategory.get(category.id) ?? []).map((item) => ({
        name: item.name,
        priceCents: item.priceCents,
        description: item.description,
        imageDataUri: opts.withPhotos ? photoByItemId.get(item.id) ?? null : null,
      })),
    }))
    .filter((category) => category.items.length > 0);
}
