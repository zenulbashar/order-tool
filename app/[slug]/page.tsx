import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ReactDOM from "react-dom";

import { canUseConcierge } from "@/lib/concierge";
import { getBaseUrl } from "@/lib/url";
import { isReservedSlug } from "@/lib/validation";

import { StorefrontFaqJsonLd, StorefrontJsonLd } from "./json-ld";
import {
  getPublicFaqs,
  getPublicMenu,
  getPublicVenueBySlug,
  getRecommendations,
} from "./queries";
import { Storefront } from "./storefront";
import type { PublicVenue } from "./types";

// The storefront reads live owner data and must never be prerendered at build
// (no DATABASE_URL there) — it is rendered per request so menu edits show up on
// the next load.
export const dynamic = "force-dynamic";

type StorefrontParams = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

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
  const description =
    venue.storefrontDescription ?? `Order online from ${venue.name}.`;
  return {
    // The venue's page is the venue's space: absolute title (no product
    // suffix), canonical at its slug, and an OG card so a shared link shows
    // the venue — its cover photo when one exists, else the brand default.
    title: { absolute: venue.name },
    description,
    alternates: { canonical: `/${venue.slug}` },
    openGraph: {
      type: "website",
      title: venue.name,
      description,
      url: `/${venue.slug}`,
      ...(venue.coverUrl ? { images: [{ url: venue.coverUrl }] } : {}),
    },
  };
}

export default async function StorefrontPage({
  params,
  searchParams,
}: StorefrontParams) {
  const { slug } = await params;
  const venue = await resolveVenue(slug);
  if (!venue) notFound();

  const [menu, faqs, sp, baseUrl] = await Promise.all([
    getPublicMenu(venue.id),
    getPublicFaqs(venue.id),
    searchParams,
    getBaseUrl(),
  ]);
  const tableParam = sp.table;
  const initialTable = typeof tableParam === "string" ? tableParam : "";

  // Preload the hero cover (the LCP element on this landing page) so the
  // browser fetches it before hydrating the client storefront. Emitted into
  // the SSR <head> as <link rel="preload" as="image" fetchpriority="high">.
  if (venue.coverUrl) {
    ReactDOM.preload(venue.coverUrl, { as: "image", fetchPriority: "high" });
  }

  // Frequently-bought-together signal (#11): read-only, venue-scoped, cached.
  // Resolved against the menu just loaded so it adds no extra menu read and only
  // ever references currently available items.
  const recommendations = await getRecommendations(venue.id, menu);

  // AI ordering concierge (#12) on/off — the SINGLE billing seam. The server
  // action re-checks it too, so a forged client can never bypass it. Suppressed
  // for a not-yet-live venue (Phase 3c) so the prompt box is not offered when
  // ordering is blocked; the concierge's own grounding/security is unchanged.
  const conciergeEnabled = (await canUseConcierge(venue)) && venue.isLive;

  // Per-venue structured data (SEO). Built from the SAME venue + menu already
  // loaded above — no extra query — and emits only owner-entered fields.
  const canonicalUrl = `${baseUrl}/${venue.slug}`;

  return (
    <>
      <StorefrontJsonLd venue={venue} menu={menu} url={canonicalUrl} />
      <StorefrontFaqJsonLd faqs={faqs} url={canonicalUrl} />
      {!venue.isLive ? (
        <div className="bg-accent/15 px-6 py-3 text-center text-sm text-ink">
          {venue.name}{" "}isn&apos;t taking orders yet. Please check back soon.
        </div>
      ) : null}
      <Storefront
        venue={venue}
        menu={menu}
        initialTable={initialTable}
        recommendations={recommendations}
        conciergeEnabled={conciergeEnabled}
        faqs={faqs}
        view="landing"
      />
    </>
  );
}
