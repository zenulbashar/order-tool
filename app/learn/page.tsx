import type { Metadata } from "next";
import Link from "next/link";

import { BrandMark, Wordmark } from "@/app/_components/wordmark";
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
    <div className="min-h-dvh bg-[#FFFDF8] text-[#16241C]">
      <header className="sticky top-0 z-50 border-b border-[rgba(247,243,234,0.08)] bg-[rgba(15,36,27,0.92)] backdrop-blur-[14px]">
        <nav className={`${CONTAINER} flex items-center gap-4 py-3`}>
          <Link href="/" className="flex items-center gap-2">
            <BrandMark className="h-[30px] w-[30px] shrink-0 rounded-lg" />
            <Wordmark className="text-[21px] text-[#F7F3EA]" />
          </Link>
          <Link
            href="/"
            className="ml-auto rounded-[9px] px-3 py-1.5 text-[13.5px] font-semibold text-[#C9D4CB] transition hover:bg-[rgba(247,243,234,0.08)] hover:text-[#F7F3EA]"
          >
            ← Back to home
          </Link>
        </nav>
      </header>

      <main className={`${CONTAINER} py-[clamp(48px,7vw,88px)]`}>
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[#B08A30]">
          Guides
        </span>
        <h1 className="mt-3 max-w-[640px] font-display text-[clamp(30px,4.4vw,52px)] font-extrabold leading-[1.05] tracking-[-0.03em]">
          Running a venue, explained plainly.
        </h1>
        <p className="mt-4 max-w-[560px] text-[16px] leading-[1.6] text-[#5C6B5E]">
          Short, honest reads on how AI ordering, QR menus, payments, and
          kitchen printing actually work — grounded in how Prompt2Eat is built.
        </p>

        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {ARTICLES.map((article) => (
            <Link
              key={article.slug}
              href={`/learn/${article.slug}`}
              className="group flex flex-col rounded-[22px] border border-[#EDE4D2] bg-[#FFFDF8] p-6 shadow-[0_1px_3px_rgba(20,30,25,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-24px_rgba(20,30,25,0.35)]"
            >
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#B08A30]">
                {article.eyebrow}
              </span>
              <h2 className="mt-2 font-display text-[19px] font-extrabold tracking-[-0.015em]">
                {article.title}
              </h2>
              <p className="mt-2 text-[14.5px] leading-[1.55] text-[#5C6B5E]">
                {article.description}
              </p>
              <span className="mt-4 text-sm font-bold text-[#16241C]">
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

        <p className="mt-12 text-sm text-[#7A8A7C]">
          Quick answers instead?{" "}
          <Link
            href="/#faq"
            className="font-bold text-[#16241C] underline decoration-[var(--color-accent)] decoration-2 underline-offset-4 hover:opacity-80"
          >
            Read the FAQ
          </Link>
        </p>
      </main>

      <footer className="border-t border-[#EDE4D2] py-8">
        <div className={`${CONTAINER} text-sm text-[#7A8A7C]`}>
          © 2026 Prompt2Eat. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
