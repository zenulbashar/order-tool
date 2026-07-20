import Link from "next/link";

import { PageHeader } from "@/app/_components/page-header";
import { cx } from "@/app/_components/cx";
import { buildSuggestions, type Severity } from "@/lib/nudges";
import { requireUser, requireVenue } from "@/lib/tenant";

import { dismissSuggestion } from "./actions";

export const dynamic = "force-dynamic";

const SEVERITY_DOT: Record<Severity, string> = {
  high: "bg-[var(--color-error)]",
  medium: "bg-warm",
  low: "bg-[var(--color-accent)]",
};

/**
 * Stock · Suggestions (Track D · D5). A live automation inbox: every item is
 * derived from current state (low stock, uncosted ingredients, stale costs,
 * thin-margin dishes), each with a one-tap Fix deep-link and a Dismiss. Nothing
 * is generated ahead of time — resolve the underlying thing and the suggestion
 * clears itself. Read-only owner analytics — no money-path involvement.
 */
export default async function SuggestionsPage() {
  await requireUser();
  const venue = await requireVenue();

  const suggestions = await buildSuggestions(venue.id);

  return (
    <main className="mx-auto w-full max-w-[1600px]">
      <PageHeader
        title="Stock"
        description={venue.name}
        action={
          <Link
            href="/dashboard/stock/scan"
            className="inline-flex items-center gap-1.5 rounded-control bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-forest transition hover:opacity-90"
          >
            <span aria-hidden="true">✦</span> Scan invoice
          </Link>
        }
      />

      <section className="space-y-4 px-5 py-8">
        <div className="inline-flex gap-1 rounded-[10px] bg-sand p-1">
          <Link
            href="/dashboard/stock/overview"
            className="rounded-[7px] px-3 py-1.5 text-xs font-semibold text-label transition hover:text-ink"
          >
            Overview
          </Link>
          <Link
            href="/dashboard/stock"
            className="rounded-[7px] px-3 py-1.5 text-xs font-semibold text-label transition hover:text-ink"
          >
            Ingredients
          </Link>
          <Link
            href="/dashboard/stock/scan"
            className="rounded-[7px] px-3 py-1.5 text-xs font-semibold text-label transition hover:text-ink"
          >
            Invoices
          </Link>
          <span className="rounded-[7px] bg-surface-elevated px-3 py-1.5 text-xs font-bold text-ink shadow-sm">
            Suggestions
          </span>
        </div>

        <div>
          <h2 className="font-display text-lg font-extrabold text-ink">
            {suggestions.length > 0
              ? `${suggestions.length} suggestion${suggestions.length === 1 ? "" : "s"}`
              : "You're all caught up"}
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            Data-backed nudges from your stock and costs. Fix one and it clears
            itself; dismiss to hide it for a while.
          </p>
        </div>

        {suggestions.length === 0 ? (
          <div className="rounded-card border border-dashed border-line p-10 text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-success)]/15 text-lg text-success-deep">
              ✓
            </div>
            <p className="mt-3 text-sm font-semibold text-ink">Nothing needs you</p>
            <p className="mt-1 text-sm text-muted">
              No low stock, uncosted ingredients, stale costs, or thin margins
              right now. New suggestions appear here as they come up.
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {suggestions.map((s) => (
              <li
                key={s.dedupeKey}
                className="flex items-start gap-3 rounded-card border border-line bg-surface-elevated p-4 shadow-card"
              >
                <span
                  className={cx(
                    "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                    SEVERITY_DOT[s.severity],
                  )}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink">{s.title}</p>
                  <p className="mt-0.5 text-sm text-muted">{s.detail}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Link
                    href={s.href}
                    className="rounded-control border border-line-strong px-3 py-1.5 text-xs font-bold text-ink transition hover:bg-hover-secondary"
                  >
                    {s.actionLabel} →
                  </Link>
                  <form action={dismissSuggestion}>
                    <input type="hidden" name="dedupeKey" value={s.dedupeKey} />
                    <button
                      type="submit"
                      className="rounded-control px-2.5 py-1.5 text-xs font-bold text-muted transition hover:text-ink hover:bg-sand"
                    >
                      Dismiss
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
