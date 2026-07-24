import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { canUseConcierge } from "@/lib/concierge";
import { getBaseUrl } from "@/lib/url";
import { isReservedSlug } from "@/lib/validation";

import { StorefrontJsonLd } from "../json-ld";
import {
  getPublicMenu,
  getPublicVenueBySlug,
  getRecommendations,
} from "../queries";
import { Storefront } from "../storefront";
import type { PublicVenue } from "../types";

// Live owner data — never prerendered at build.
export const dynamic = "force-dynamic";

type MenuParams = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

async function resolveVenue(slug: string): Promise<PublicVenue | null> {
  if (isReservedSlug(slug)) return null;
  return getPublicVenueBySlug(slug);
}

export async function generateMetadata({
  params,
}: MenuParams): Promise<Metadata> {
  const { slug } = await params;
  const venue = await resolveVenue(slug);
  if (!venue) return { title: "Venue not found" };
  const description =
    venue.storefrontDescription ?? `Order online from ${venue.name}.`;
  return {
    title: `Menu · ${venue.name}`,
    description,
    // This page renders the same venue content as /{slug}; canonicalising to
    // the storefront landing consolidates ranking signals on ONE URL instead
    // of splitting them across near-duplicates.
    alternates: { canonical: `/${venue.slug}` },
    openGraph: {
      type: "website",
      title: `Menu · ${venue.name}`,
      description,
      url: `/${venue.slug}`,
      ...(venue.coverUrl ? { images: [{ url: venue.coverUrl }] } : {}),
    },
  };
}

/**
 * The ordering page: the full menu (tabs + item grid + cart rail + concierge).
 * Split from the categories landing (`/[slug]`) so neither page is a long scroll.
 * Same data + guards as the landing; only the storefront `view` differs.
 */
export default async function MenuPage({ params, searchParams }: MenuParams) {
  const { slug } = await params;
  const venue = await resolveVenue(slug);
  if (!venue) notFound();

  const [menu, sp, baseUrl] = await Promise.all([
    getPublicMenu(venue.id),
    searchParams,
    getBaseUrl(),
  ]);
  const tableParam = sp.table;
  const initialTable = typeof tableParam === "string" ? tableParam : "";

  const recommendations = await getRecommendations(venue.id, menu);
  const conciergeEnabled = (await canUseConcierge(venue)) && venue.isLive;
  const canonicalUrl = `${baseUrl}/${venue.slug}/menu`;

  return (
    <>
      <StorefrontJsonLd venue={venue} menu={menu} url={canonicalUrl} />
      {!venue.isLive ? (
        <div className="bg-accent/15 px-6 py-3 text-center text-sm text-ink">
          {venue.name} isn&apos;t taking orders yet. Please check back soon.
        </div>
      ) : null}
      <Storefront
        venue={venue}
        menu={menu}
        initialTable={initialTable}
        recommendations={recommendations}
        conciergeEnabled={conciergeEnabled}
        view="menu"
      />
    </>
  );
}
