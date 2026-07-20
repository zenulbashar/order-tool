import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { SITE_DESCRIPTION, SITE_TAGLINE } from "@/lib/seo";
import { getCurrentVenue } from "@/lib/tenant";

import { Landing } from "./_landing/landing";
import { MarketingJsonLd } from "./_landing/marketing-json-ld";

/**
 * Root of every domain this app serves. The MARKETING host (prompt2eat.com)
 * shows the landing page; the ordering/app host (e.g. order.zaleit.com.au) keeps
 * the owner-app entry redirect. Marketing hosts are configurable via
 * MARKETING_HOSTS (comma-separated); `?preview=landing` forces the landing on any
 * host for testing.
 */
const DEFAULT_MARKETING_HOSTS = ["prompt2eat.com"];

function marketingHosts(): string[] {
  const env = process.env.MARKETING_HOSTS;
  if (!env) return DEFAULT_MARKETING_HOSTS;
  return env
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

async function isMarketingHost(): Promise<boolean> {
  const host = (await headers()).get("host")?.toLowerCase() ?? "";
  return marketingHosts().some(
    (h) => host === h || host.endsWith(`.${h}`) || host.includes(h),
  );
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}): Promise<Metadata> {
  // Same gate as the page body (`?preview=landing` forces the landing on any
  // host), so the metadata always describes what actually renders.
  const { preview } = await searchParams;
  if (preview === "landing" || (await isMarketingHost())) {
    // The one page we most want ranked: absolute-default title (no template
    // suffix doubling the brand), explicit canonical, and the root OG defaults
    // (app/layout.tsx) already point here.
    return {
      title: { absolute: `Prompt2Eat — ${SITE_TAGLINE}` },
      description: SITE_DESCRIPTION,
      alternates: { canonical: "/" },
    };
  }
  // Non-marketing hosts serve a signed-in redirect at "/" — nothing to index.
  return { robots: { index: false, follow: false } };
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const [{ preview }, marketing] = await Promise.all([
    searchParams,
    isMarketingHost(),
  ]);
  if (preview === "landing" || marketing) {
    return (
      <>
        <MarketingJsonLd />
        <Landing />
      </>
    );
  }

  const session = await auth();
  if (!session?.user) {
    redirect("/signin");
  }
  const venue = await getCurrentVenue();
  redirect(venue ? "/dashboard" : "/onboarding");
}
