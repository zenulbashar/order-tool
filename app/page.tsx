import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { getCurrentVenue } from "@/lib/tenant";

import { Landing } from "./_landing/landing";

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

export async function generateMetadata(): Promise<Metadata> {
  if (await isMarketingHost()) {
    return {
      title: "Prompt2Eat · Just say what you're hungry for",
      description:
        "The AI-native way to order. Diners scan the table and talk to the concierge; restaurants sell more per table and run the whole venue in one place.",
    };
  }
  return {};
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
    return <Landing />;
  }

  const session = await auth();
  if (!session?.user) {
    redirect("/signin");
  }
  const venue = await getCurrentVenue();
  redirect(venue ? "/dashboard" : "/onboarding");
}
