import { PageHeader } from "@/app/_components/page-header";
import { requireUser, requireVenue } from "@/lib/tenant";

import type { MenuArtworkData } from "./artwork";
import { buildMenuCategories, inlineImage } from "./menu-data";
import { StudioClient } from "./studio-client";

export const dynamic = "force-dynamic";

/**
 * Design studio (Track G). One-click print menus + promo banners generated from
 * the venue's LIVE menu data and brand, at multiple pixel sizes. Pure client-
 * side export (SVG/PNG/print) — no new dependencies, no writes, no money-path
 * involvement. Only ACTIVE items are included, so the artwork mirrors the
 * storefront. Item photos are fetched lazily (the "Show photos" toggle), so the
 * initial load stays fast — here we build the text menu + inline only the logo.
 */
export default async function StudioPage() {
  await requireUser();
  const venue = await requireVenue();

  const [categories, logoDataUri] = await Promise.all([
    buildMenuCategories(venue.id, { withPhotos: false }),
    inlineImage(venue.logoUrl),
  ]);

  const menuData: MenuArtworkData = {
    venueName: venue.name,
    brandColor: venue.brandColor,
    tagline: venue.storefrontDescription ?? null,
    logoDataUri,
    categories,
  };

  return (
    <main className="mx-auto w-full max-w-[1600px]">
      <PageHeader
        title="Studio"
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
