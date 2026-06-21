import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { formatCents, isReservedSlug } from "@/lib/validation";

import { getPublicMenu, getPublicVenueBySlug } from "./queries";
import type { PublicVenue } from "./types";

// The storefront reads live owner data and must never be prerendered at build
// (no DATABASE_URL there) — it is rendered per request so menu edits show up on
// the next load.
export const dynamic = "force-dynamic";

type StorefrontParams = { params: Promise<{ slug: string }> };

/**
 * Resolve a storefront by slug. Reserved slugs never resolve — even if a row
 * somehow holds one — so a venue can never shadow an app route (defense in
 * depth alongside the creation-time block in onboarding).
 */
async function resolveVenue(slug: string): Promise<PublicVenue | null> {
  if (isReservedSlug(slug)) return null;
  return getPublicVenueBySlug(slug);
}

export async function generateMetadata({
  params,
}: StorefrontParams): Promise<Metadata> {
  const { slug } = await params;
  const venue = await resolveVenue(slug);
  if (!venue) return { title: "Venue not found" };
  return {
    title: venue.name,
    description:
      venue.storefrontDescription ?? `Order online from ${venue.name}.`,
  };
}

export default async function StorefrontPage({ params }: StorefrontParams) {
  const { slug } = await params;
  const venue = await resolveVenue(slug);
  if (!venue) notFound();

  const menu = await getPublicMenu(venue.id);
  const brandStyle = { "--brand": venue.brandColor } as React.CSSProperties;

  return (
    <main style={brandStyle} className="mx-auto min-h-dvh max-w-2xl bg-white">
      <header className="flex items-center gap-4 border-b border-gray-100 px-5 py-6">
        {venue.logoUrl ? (
          // Arbitrary owner-supplied URL; next/image would need remote config.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={venue.logoUrl}
            alt={`${venue.name} logo`}
            className="h-12 w-12 rounded-full object-cover"
          />
        ) : (
          <span
            className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-semibold text-white"
            style={{ backgroundColor: "var(--brand)" }}
          >
            {venue.name.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight text-gray-900">
            {venue.name}
          </h1>
          {venue.storefrontDescription ? (
            <p className="truncate text-sm text-gray-500">
              {venue.storefrontDescription}
            </p>
          ) : null}
        </div>
      </header>

      <div className="space-y-8 px-5 py-6">
        {menu.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
            This venue hasn’t published a menu yet. Check back soon.
          </p>
        ) : (
          menu.map((category) => (
            <section key={category.id} id={category.id}>
              <h2 className="text-lg font-semibold tracking-tight text-gray-900">
                {category.name}
              </h2>
              {category.description ? (
                <p className="mt-0.5 text-sm text-gray-500">
                  {category.description}
                </p>
              ) : null}
              <ul className="mt-3 divide-y divide-gray-100">
                {category.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-start justify-between gap-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {item.name}
                      </p>
                      {item.description ? (
                        <p className="mt-0.5 line-clamp-1 text-sm text-gray-500">
                          {item.description}
                        </p>
                      ) : null}
                    </div>
                    <p className="shrink-0 text-sm text-gray-700">
                      ${formatCents(item.priceCents)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </main>
  );
}
