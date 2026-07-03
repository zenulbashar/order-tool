import { PageHeader } from "@/app/_components/page-header";
import { requireUser, requireVenue } from "@/lib/tenant";

import {
  getCategoriesForVenue,
  getItemsForVenue,
} from "../menu/queries";

import type { MenuArtworkData } from "./artwork";
import { StudioClient } from "./studio-client";

export const dynamic = "force-dynamic";

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

  const [categories, items] = await Promise.all([
    getCategoriesForVenue(venue.id),
    getItemsForVenue(venue.id),
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
