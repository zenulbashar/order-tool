import Link from "next/link";

import { buttonStyles } from "@/app/_components/button-variants";

/**
 * Root 404 — served for any unmatched path outside the venue subtree (which
 * has its own app/[slug]/not-found.tsx). Static, no data reads; returns a real
 * 404 status so broken URLs drop out of search indexes instead of soft-404ing.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-surface px-6 text-center">
      <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-label">
        404
      </p>
      <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
        This page doesn&apos;t exist.
      </h1>
      <p className="max-w-md text-sm text-muted">
        The link may be old or mistyped. If you were looking for a venue, check
        the spelling of its storefront address.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-3">
        <Link href="/" className={buttonStyles("primary", "md")}>
          Go to the homepage
        </Link>
        <Link href="/learn" className={buttonStyles("secondary", "md")}>
          Read the guides
        </Link>
      </div>
    </main>
  );
}
