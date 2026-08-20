import type { Metadata } from "next";
import { MarketingHeader } from "@/app/_landing/marketing-header";
import Link from "next/link";

import { getShopProducts } from "@/lib/shop/feed";

import { ShopGrid } from "./shop-grid";
import { ShopJsonLd } from "./shop-json-ld";

export const metadata: Metadata = {
  title: "Shop venue equipment & supplies",
  description:
    "Screens, laptops, tablets, networking, security cameras, and everything else your venue needs to open its doors.",
  alternates: { canonical: "/shop" },
};

// The feed is fetched with its own 1h cache; render dynamically so the page
// reflects feed + env changes.
export const dynamic = "force-dynamic";

const CONTAINER = "mx-auto w-full max-w-[1240px] px-[clamp(18px,4vw,48px)]";

export default async function ShopPage() {
  const { products, source } = await getShopProducts();

  return (
    <div className="min-h-dvh bg-surface-elevated text-forest">
      {/* Structured data ONLY for a real feed.
          `source` was destructured away here, so with SHOP_FEED_URL unset the
          six hardcoded placeholders in lib/shop/feed.ts — a 50" signage display
          at $640, a 14" laptop at $899 — were published as Product/Offer markup
          carrying priceCurrency "AUD", a real price and InStock availability.
          ShopJsonLd's docblock promises "the markup never claims an offer the
          page doesn't display", which is true of the PAGE and says nothing
          about whether the offer exists.
          app/robots.ts deliberately admits GPTBot, ClaudeBot and PerplexityBot,
          so those were machine-readable commerce claims about products nobody
          can buy. The discriminant to prevent it already existed; it was just
          being thrown away. */}
      {source === "feed" ? <ShopJsonLd products={products} /> : null}
      {/* Slim nav */}
      <MarketingHeader
        container={CONTAINER}
        back={{ href: "/", label: "← Back to home" }}
        cta
      />

      <main className={`${CONTAINER} py-[clamp(40px,6vw,80px)]`}>
        <div className="max-w-[640px]">
          <span className="font-mono text-eyebrow font-bold uppercase tracking-[0.18em] text-[var(--mkt-eyebrow)]">
            The shop
          </span>
          <h1 className="mt-3 font-display text-[clamp(32px,5vw,56px)] font-extrabold leading-[1.02] tracking-[-0.03em]">
            Everything your venue needs.
          </h1>
          <p className="mt-4 text-[clamp(16px,1.7vw,20px)] leading-[1.55] text-[var(--mkt-muted)]">
            Screens, laptops, network gear, security cameras, and the rest of
            the hardware it takes to open your doors. Ordered from the same
            place you run Prompt2Eat, and shipped to your door.
          </p>
        </div>

        <div className="mt-10">
          <ShopGrid products={products} />
        </div>
      </main>

      <footer className="border-t border-[var(--mkt-line)] py-8">
        <div className={`${CONTAINER} flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--mkt-muted-warm)]`}>
          <span>© 2026 Prompt2Eat. All rights reserved.</span>
          <Link href="/" className="font-semibold text-forest hover:underline">
            prompt2eat.com
          </Link>
        </div>
      </footer>
    </div>
  );
}
