import type { Metadata } from "next";
import Link from "next/link";

import { getShopProducts } from "@/lib/shop/feed";

import { ShopGrid } from "./shop-grid";

export const metadata: Metadata = {
  title: "Shop · Prompt2Eat",
  description:
    "Screens, laptops, tablets, networking, security cameras, and everything else your venue needs to open its doors.",
};

// The feed is fetched with its own 1h cache; render dynamically so the page
// reflects feed + env changes.
export const dynamic = "force-dynamic";

const CONTAINER = "mx-auto w-full max-w-[1240px] px-[clamp(18px,4vw,48px)]";

export default async function ShopPage() {
  const { products } = await getShopProducts();

  return (
    <div className="min-h-dvh bg-[#FFFDF8] text-[#16241C]">
      {/* Slim nav */}
      <header className="sticky top-0 z-50 border-b border-[rgba(247,243,234,0.08)] bg-[rgba(15,36,27,0.92)] backdrop-blur-[14px]">
        <nav className={`${CONTAINER} flex items-center gap-4 py-3`}>
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-[var(--color-accent)] font-display text-base font-extrabold text-[#0c1c15]">
              P
            </span>
            <span className="font-display text-[21px] font-extrabold tracking-[-0.035em] text-[#F7F3EA]">
              Prompt<span className="text-[var(--color-accent)]">2</span>Eat
            </span>
          </Link>
          <Link
            href="/"
            className="ml-auto rounded-[9px] px-3 py-1.5 text-[13.5px] font-semibold text-[#C9D4CB] transition hover:bg-[rgba(247,243,234,0.08)] hover:text-[#F7F3EA]"
          >
            ← Back to home
          </Link>
          <Link
            href="/signin"
            className="rounded-[11px] bg-[var(--color-accent)] px-4 py-1.5 text-[13.5px] font-bold text-[#16241C] transition hover:-translate-y-0.5"
          >
            Start free
          </Link>
        </nav>
      </header>

      <main className={`${CONTAINER} py-[clamp(40px,6vw,80px)]`}>
        <div className="max-w-[640px]">
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[#B08A30]">
            The shop
          </span>
          <h1 className="mt-3 font-display text-[clamp(32px,5vw,56px)] font-extrabold leading-[1.02] tracking-[-0.03em]">
            Everything your venue needs.
          </h1>
          <p className="mt-4 text-[clamp(16px,1.7vw,20px)] leading-[1.55] text-[#6E756B]">
            Screens, laptops, network gear, security cameras, and the rest of
            the hardware it takes to open your doors. Ordered from the same
            place you run Prompt2Eat, and shipped to your door.
          </p>
        </div>

        <div className="mt-10">
          <ShopGrid products={products} />
        </div>
      </main>

      <footer className="border-t border-[#EDE4D2] py-8">
        <div className={`${CONTAINER} flex flex-wrap items-center justify-between gap-3 text-sm text-[#7C8579]`}>
          <span>© 2026 Prompt2Eat. All rights reserved.</span>
          <Link href="/" className="font-semibold text-[#16241C] hover:underline">
            prompt2eat.com
          </Link>
        </div>
      </footer>
    </div>
  );
}
