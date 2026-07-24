import Link from "next/link";
import type { ReactNode } from "react";

import { BrandMark, Wordmark } from "@/app/_components/wordmark";

/**
 * Shared shell for the standalone marketing/legal pages (about, contact,
 * privacy, terms). A slim top bar (wordmark → home, a couple of links) and a
 * simple footer wrap a centered prose column. Server component, static — no
 * data, no client JS — so these pages prerender and stay crawlable.
 */
export function MarketingPageShell({
  title,
  intro,
  updated,
  children,
}: {
  title: string;
  intro?: string;
  /** ISO date shown as "Last updated" on the legal pages. */
  updated?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-surface text-ink">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-[880px] items-center justify-between px-5 py-4">
          <Link href="/" className="flex items-center gap-2" aria-label="Prompt2Eat home">
            <BrandMark className="h-7 w-7 shrink-0" />
            <Wordmark className="text-base text-forest" />
          </Link>
          <nav className="flex items-center gap-5 text-sm font-medium text-muted">
            <Link href="/learn" className="transition hover:text-ink">
              Guides
            </Link>
            <Link href="/#pricing" className="transition hover:text-ink">
              Pricing
            </Link>
            <Link href="/signin" className="transition hover:text-ink">
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[760px] px-5 py-12 sm:py-16">
        <h1 className="font-display text-[clamp(30px,4.4vw,44px)] font-extrabold tracking-tight text-ink">
          {title}
        </h1>
        {updated ? (
          <p className="mt-2 font-mono text-xs font-bold uppercase tracking-wider text-label">
            Last updated {updated}
          </p>
        ) : null}
        {intro ? (
          <p className="mt-4 text-lg leading-relaxed text-muted">{intro}</p>
        ) : null}
        <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-ink [&_a]:font-medium [&_a]:text-[var(--action)] [&_a:hover]:underline [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-ink [&_h2:not(:first-child)]:mt-8 [&_p]:text-muted [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_ul]:text-muted">
          {children}
        </div>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[880px] flex-wrap items-center justify-between gap-3 px-5 py-6 text-sm text-muted">
          <span>© 2026 Prompt2Eat. All rights reserved.</span>
          <nav className="flex gap-4">
            <Link href="/about" className="transition hover:text-ink">
              About
            </Link>
            <Link href="/contact" className="transition hover:text-ink">
              Contact
            </Link>
            <Link href="/privacy" className="transition hover:text-ink">
              Privacy
            </Link>
            <Link href="/terms" className="transition hover:text-ink">
              Terms
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
