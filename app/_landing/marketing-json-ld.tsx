import {
  serializeJsonLd,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_URL,
} from "@/lib/seo";

/**
 * Structured data for the marketing landing page — the machine-readable half of
 * SEO/AEO. Three factual nodes in one @graph (Google's preferred packaging):
 *
 *  - Organization: who makes the product (name, logo, url) — powers brand
 *    knowledge panels and gives AI crawlers an authoritative entity to cite.
 *  - WebSite: names the site so search treats prompt2eat.com as its home.
 *  - SoftwareApplication: what the product IS (category, audience, platform) —
 *    the schema answer engines lean on for "what is X / best Y" questions.
 *
 * Only real, verifiable facts are emitted — no fabricated ratings/reviews
 * (fake aggregateRating is a Google penalty, not a boost). Server-only; the
 * serializer escapes "<" so nothing can break out of the script tag.
 */
export function MarketingJsonLd() {
  const json = serializeJsonLd({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: SITE_URL,
        logo: {
          "@type": "ImageObject",
          url: `${SITE_URL}/icons/icon-512.png`,
          width: 512,
          height: 512,
        },
        slogan: SITE_TAGLINE,
        description: SITE_DESCRIPTION,
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE_URL}/#software`,
        name: SITE_NAME,
        url: SITE_URL,
        description: SITE_DESCRIPTION,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        publisher: { "@id": `${SITE_URL}/#organization` },
        // Real commercial facts only: a free trial exists (see onboarding
        // "Choose a plan" — 30-day trial on every tier).
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "AUD",
          description: "30-day free trial",
        },
        featureList: [
          "AI concierge ordering — diners say what they feel like",
          "QR code dine-in and takeaway ordering",
          "Menu import from a photo",
          "Payments: cards, Apple Pay, Google Pay, PayTo pay-by-bank",
          "Live kitchen order board and docket printing",
          "Multi-station kitchen label printing",
          "Stock, staff roster, and storefront management",
        ],
        audience: {
          "@type": "Audience",
          audienceType: "Restaurants, cafés, and hospitality venues",
        },
      },
    ],
  });

  return (
    <script
      type="application/ld+json"
      // Safe: serializeJsonLd escapes "<" so no value can break out of the tag.
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
