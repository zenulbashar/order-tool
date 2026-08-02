import type { Metadata } from "next";
import { MarketingHeader } from "@/app/_landing/marketing-header";
import Link from "next/link";

import { ARTICLES } from "@/lib/marketing-content";

export const metadata: Metadata = {
  title: "Guides — AI ordering, QR menus & kitchen printing",
  description:
    "Plain-English guides to running a venue on Prompt2Eat: AI ordering, QR code dine-in, importing a menu from a photo, PayTo pay-by-bank, and kitchen station printing.",
  alternates: { canonical: "/learn" },
};

const CONTAINER = "mx-auto w-full max-w-[1080px] px-[clamp(18px,4vw,48px)]";

/**
 * The /learn content hub — the long-tail SEO surface. Fully static (articles
 * are typed data in lib/marketing-content.ts, no DB), each guide targeting one
 * search intent with its own page, metadata, and Article JSON-LD. Chrome
 * mirrors the shop page: slim forest nav + cream body.
 */
export default function LearnIndexPage() {
  return (
    <div className="min-h-dvh bg-surface-elevated text-forest">
      <MarketingHeader
        container={CONTAINER}
        back={{ href: "/", label: "← Back to home" }}
      />

      <main className={`${CONTAINER} py-[clamp(48px,7vw,88px)]`}>
        <span className="font-mono text-eyebrow font-bold uppercase tracking-[0.18em] text-[var(--mkt-eyebrow)]">
          Guides
        </span>
        <h1 className="mt-3 max-w-[640px] font-display text-[clamp(30px,4.4vw,52px)] font-extrabold leading-[1.05] tracking-[-0.03em]">
          Running a venue, explained plainly.
        </h1>
        <p className="mt-4 max-w-[560px] text-[16px] leading-[1.6] text-[var(--mkt-sage)]">
          Short, honest reads on how AI ordering, QR menus, payments, and
          kitchen printing actually work — grounded in how Prompt2Eat is built.
        </p>

        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {ARTICLES.map((article) => (
            <Link
              key={article.slug}
              href={`/learn/${article.slug}`}
              className="group flex flex-col rounded-[22px] border border-[var(--mkt-line)] bg-surface-elevated p-6 shadow-[0_1px_3px_rgba(20,30,25,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-24px_rgba(20,30,25,0.35)]"
            >
              <span className="font-mono text-micro font-bold uppercase tracking-[0.16em] text-[var(--mkt-eyebrow)]">
                {article.eyebrow}
              </span>
              <h2 className="mt-2 font-display text-[19px] font-extrabold tracking-[-0.015em]">
                {article.title}
              </h2>
              <p className="mt-2 text-[14.5px] leading-[1.55] text-[var(--mkt-sage)]">
                {article.description}
              </p>
              <span className="mt-4 text-sm font-bold text-forest">
                Read the guide{" "}
                <span
                  aria-hidden="true"
                  className="inline-block transition group-hover:translate-x-0.5"
                >
                  →
                </span>
              </span>
            </Link>
          ))}
        </div>

        <p className="mt-12 text-sm text-[var(--mkt-sage-deep)]">
          Quick answers instead?{" "}
          <Link
            href="/#faq"
            className="font-bold text-forest underline decoration-[var(--color-accent)] decoration-2 underline-offset-4 hover:opacity-80"
          >
            Read the FAQ
          </Link>
        </p>
      </main>

      <footer className="border-t border-[var(--mkt-line)] py-8">
        <div className={`${CONTAINER} text-sm text-[var(--mkt-sage-deep)]`}>
          © 2026 Prompt2Eat. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
