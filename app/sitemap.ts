import { isNotNull } from "drizzle-orm";
import type { MetadataRoute } from "next";

import { db } from "@/lib/db";
import { venues } from "@/lib/db/schema";
import { ARTICLES } from "@/lib/marketing-content";
import { SEGMENTS } from "@/lib/marketing-segments";
import { SITE_URL } from "@/lib/seo";

// Rendered per-request so newly-live venues appear without a redeploy (crawlers
// re-fetch sitemaps frequently; this is a single indexed query).
export const dynamic = "force-dynamic";

/**
 * Sitemap (served at /sitemap.xml): the static marketing pages plus one entry
 * per LIVE venue storefront — a venue's public menu page ranking for
 * "order from <venue>" is part of the product. Live = onboarding completed
 * (the same signal that opens order-taking); paused/mid-setup venues are
 * omitted. Tokenised diner flows (checkout/order/account) are deliberately
 * absent and are disallowed in robots.ts.
 *
 * DB-safe: in an environment with no database (CI builds, previews) the venue
 * query degrades to just the static pages instead of failing the request.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/`,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/shop`,
      changeFrequency: "weekly",
      priority: 0.6,
    },
    // The /learn content hub — static guide pages (lib/marketing-content.ts).
    {
      url: `${SITE_URL}/learn`,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    ...ARTICLES.map((article) => ({
      url: `${SITE_URL}/learn/${article.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    // Audience "service" pages (static).
    ...SEGMENTS.map((segment) => ({
      url: `${SITE_URL}/for/${segment.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    // Company + legal pages (static).
    ...["about", "contact", "privacy", "terms"].map((path) => ({
      url: `${SITE_URL}/${path}`,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
  ];

  let venuePages: MetadataRoute.Sitemap = [];
  try {
    const rows = await db
      .select({ slug: venues.slug, createdAt: venues.createdAt })
      .from(venues)
      .where(isNotNull(venues.onboardingCompletedAt));
    venuePages = rows.map((venue) => ({
      url: `${SITE_URL}/${venue.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.8,
    }));
  } catch {
    // No database reachable (build/preview) — serve the static pages only.
  }

  return [...staticPages, ...venuePages];
}
