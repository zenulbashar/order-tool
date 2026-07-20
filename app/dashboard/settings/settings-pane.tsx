import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Two-pane settings layout: the form on the left, a sticky context rail on the
 * right. Fills the width on laptops/monitors (the form no longer floats in a
 * readable column with dead space beside it) while keeping the form itself a
 * comfortable width. Stacks to one column below `lg`, so mobile is unchanged.
 *
 * Presentational only — server-safe.
 */
export function SettingsPane({
  aside,
  children,
}: {
  aside: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-8">
      <div className="min-w-0">{children}</div>
      <aside className="lg:sticky lg:top-6 lg:self-start">{aside}</aside>
    </div>
  );
}

/**
 * The default context card for a storefront-affecting setting: a short "where
 * this appears" note plus a one-tap link to the live storefront so the owner
 * can see the result of a save. Genuine utility, not filler — it's the fastest
 * path from "changed a setting" to "saw it on the storefront".
 */
export function StorefrontHint({
  slug,
  where,
  children,
}: {
  slug: string;
  /** One line: where on the storefront (or receipt) this setting shows up. */
  where: string;
  /** Optional extra tip paragraph. */
  children?: ReactNode;
}) {
  return (
    <div className="rounded-card border border-line bg-surface-elevated p-4 shadow-sm">
      <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-label">
        Where it shows
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{where}</p>
      {children ? (
        <p className="mt-2 text-sm leading-relaxed text-muted">{children}</p>
      ) : null}
      <Link
        href={`/${slug}`}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[var(--action)] transition hover:opacity-80"
      >
        View your storefront
        <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
}
