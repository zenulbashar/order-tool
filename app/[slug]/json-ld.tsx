import { OPENING_DAYS } from "@/lib/validation";

import type { PublicMenu, PublicVenue } from "./types";

// Stored day index (0=Monday … 6=Sunday) -> schema.org DayOfWeek name.
const DAY_NAME = new Map<number, string>(
  OPENING_DAYS.map((day): [number, string] => [day.day, day.label]),
);

/** Format integer cents as a plain dollars string, e.g. 1490 -> "14.90". */
function priceFromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Build the schema.org Restaurant graph for a venue's storefront.
 *
 * INTEGRITY RULE: every optional property is added only when its underlying
 * value is actually set. There is deliberately NO generic "drop falsy" pass —
 * a latitude/longitude of 0 is a legitimate coordinate that such a pass would
 * wrongly delete, and Google penalises fabricated/empty structured data. Prices
 * are the real AUD amounts already shown on the page (integer cents -> dollars).
 */
function buildStorefrontJsonLd(
  venue: PublicVenue,
  menu: PublicMenu,
  url: string,
): Record<string, unknown> {
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    "@id": url,
    name: venue.name,
    url,
  };

  if (venue.logoUrl) {
    jsonLd.image = venue.logoUrl;
    jsonLd.logo = venue.logoUrl;
  }
  if (venue.phone) jsonLd.telephone = venue.phone;

  // sameAs — the venue's other homes on the web (social profiles + website).
  // Helps search/AI engines tie this storefront to the real-world entity.
  // Same integrity rule as everything here: only real, owner-entered links.
  const sameAs = [
    venue.instagramUrl,
    venue.facebookUrl,
    venue.xUrl,
    venue.youtubeUrl,
    venue.tiktokUrl,
    venue.linkedinUrl,
    venue.websiteUrl,
  ].filter((url): url is string => Boolean(url));
  if (sameAs.length > 0) jsonLd.sameAs = sameAs;

  // PostalAddress — built from only the parts that are set, and attached only
  // when at least one street/suburb/state/postcode exists. A lone country
  // (e.g. the form's "AU" default) is never emitted on its own.
  const address: Record<string, string> = {};
  if (venue.streetAddress) address.streetAddress = venue.streetAddress;
  if (venue.suburb) address.addressLocality = venue.suburb;
  if (venue.state) address.addressRegion = venue.state;
  if (venue.postcode) address.postalCode = venue.postcode;
  if (Object.keys(address).length > 0) {
    if (venue.country) address.addressCountry = venue.country;
    jsonLd.address = { "@type": "PostalAddress", ...address };
  }

  // GeoCoordinates — only when BOTH coordinates are present (the schema enforces
  // both-or-neither; guarded here too so the markup can never be half-set).
  if (venue.latitude !== null && venue.longitude !== null) {
    jsonLd.geo = {
      "@type": "GeoCoordinates",
      latitude: venue.latitude,
      longitude: venue.longitude,
    };
  }

  // OpeningHoursSpecification — one per stored range; omitted entirely if none.
  if (venue.openingHours && venue.openingHours.length > 0) {
    const specs = venue.openingHours.flatMap((entry) => {
      const dayOfWeek = DAY_NAME.get(entry.day);
      if (!dayOfWeek) return [];
      return [
        {
          "@type": "OpeningHoursSpecification",
          dayOfWeek,
          opens: entry.opens,
          closes: entry.closes,
        },
      ];
    });
    if (specs.length > 0) jsonLd.openingHoursSpecification = specs;
  }

  // Menu — reuse the already-fetched public menu. getPublicMenu drops empty
  // categories, so this never emits a section with no items.
  if (menu.length > 0) {
    jsonLd.hasMenu = {
      "@type": "Menu",
      hasMenuSection: menu.map((category) => ({
        "@type": "MenuSection",
        name: category.name,
        ...(category.description ? { description: category.description } : {}),
        hasMenuItem: category.items.map((item) => {
          const menuItem: Record<string, unknown> = {
            "@type": "MenuItem",
            name: item.name,
            offers: {
              "@type": "Offer",
              priceCurrency: "AUD",
              price: priceFromCents(item.priceCents),
            },
          };
          if (item.description) menuItem.description = item.description;
          if (item.imageUrl) menuItem.image = item.imageUrl;
          return menuItem;
        }),
      })),
    };
  }

  return jsonLd;
}

// The U+2028 / U+2029 line separators, resolved at runtime so no literal
// (invisible) control character ever appears in this source file.
const LINE_SEP = String.fromCharCode(0x2028);
const PARA_SEP = String.fromCharCode(0x2029);

/**
 * Serialise JSON-LD for safe inline embedding in a <script> tag. JSON.stringify
 * handles JSON escaping but NOT the HTML hazard of a literal "</script>" (or
 * "<!--") inside owner/customer text, which would close the tag early. Escaping
 * each "<" to its escaped unicode form neutralises </script>, <script, and
 * <!-- while still parsing back to the exact data — the approach the Next.js
 * JSON-LD guide recommends. The U+2028/U+2029 separators are escaped too.
 */
function serializeJsonLd(jsonLd: Record<string, unknown>): string {
  return JSON.stringify(jsonLd)
    .replace(/</g, "\\u003c")
    .split(LINE_SEP)
    .join("\\u2028")
    .split(PARA_SEP)
    .join("\\u2029");
}

/**
 * Per-venue structured data for the public storefront. Server-only (no
 * "use client"); rendered from the page with the SAME venue + menu it already
 * loaded, so it adds zero queries and can never bleed another venue's data.
 * Only real, owner-entered fields are emitted.
 */
export function StorefrontJsonLd({
  venue,
  menu,
  url,
}: {
  venue: PublicVenue;
  menu: PublicMenu;
  url: string;
}) {
  const json = serializeJsonLd(buildStorefrontJsonLd(venue, menu, url));
  return (
    <script
      type="application/ld+json"
      // Safe: serializeJsonLd escapes "<" so no value can break out of the tag.
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
