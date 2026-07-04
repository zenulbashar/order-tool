import { PageHeader } from "@/app/_components/page-header";
import { requireUser, requireVenue } from "@/lib/tenant";

import {
  getCategoriesForVenue,
  getItemsForVenue,
} from "../menu/queries";

import type { MenuArtworkData } from "./artwork";
import { StudioClient } from "./studio-client";

export const dynamic = "force-dynamic";

// Raster image types we'll inline. SVG is intentionally excluded — an SVG image
// referenced inside the artwork can taint the export canvas in some browsers, so
// SVG logos simply don't appear in studio artwork (they still show elsewhere).
const INLINE_LOGO_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
const INLINE_LOGO_MAX_BYTES = 2 * 1024 * 1024; // 2MB

/**
 * Fetch the venue logo server-side and return it as a data: URI so the artwork
 * can embed it WITHOUT tainting the client-side PNG export canvas (a remote URL
 * would). Bounded (3s timeout, 2MB, raster types only) and fail-soft: any
 * problem returns null and the artwork falls back to its typographic header.
 */
async function inlineLogo(url: string | null): Promise<string | null> {
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
    if (!INLINE_LOGO_TYPES.has(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > INLINE_LOGO_MAX_BYTES) return null;
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Design studio (Track G). One-click print menus + promo banners generated from
 * the venue's LIVE menu data and brand, at multiple pixel sizes. Pure client-
 * side export (SVG/PNG/print) — no new dependencies, no writes, no money-path
 * involvement. Only ACTIVE items are included, so the artwork mirrors the
 * storefront.
 */
export default async function StudioPage() {
  await requireUser();
  const venue = await requireVenue();

  const [categories, items, logoDataUri] = await Promise.all([
    getCategoriesForVenue(venue.id),
    getItemsForVenue(venue.id),
    inlineLogo(venue.logoUrl),
  ]);

  const itemsByCategory = new Map<string, typeof items>();
  for (const item of items) {
    if (!item.isAvailable) continue; // mirror the storefront — live items only
    const list = itemsByCategory.get(item.categoryId) ?? [];
    list.push(item);
    itemsByCategory.set(item.categoryId, list);
  }

  const menuData: MenuArtworkData = {
    venueName: venue.name,
    brandColor: venue.brandColor,
    tagline: venue.storefrontDescription ?? null,
    logoDataUri,
    categories: categories
      .filter((category) => category.isActive)
      .map((category) => ({
        name: category.name,
        items: (itemsByCategory.get(category.id) ?? []).map((item) => ({
          name: item.name,
          priceCents: item.priceCents,
          description: item.description,
        })),
      }))
      .filter((category) => category.items.length > 0),
  };

  return (
    <main className="mx-auto max-w-6xl">
      <PageHeader
        title="Design studio"
        description={venue.name}
        backHref="/dashboard/menu"
      />
      {menuData.categories.length === 0 ? (
        <div className="px-5 py-8">
          <div className="rounded-card border border-dashed border-line p-8 text-center text-sm text-muted">
            Add some menu items first — the studio builds menus and banners from
            your live menu.
          </div>
        </div>
      ) : (
        <StudioClient slug={venue.slug} menuData={menuData} />
      )}
    </main>
  );
}
