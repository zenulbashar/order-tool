"use client";

import { Button } from "@/app/_components/button";

/**
 * The storefront's filtered-menu empty state (search and/or dietary filters
 * matched nothing). Purely presentational + callbacks — the search/filter
 * state itself lives in StorefrontInner. The concierge CTA only PREFILLS and
 * opens the existing panel (no AI call happens until the diner taps send) and
 * renders only while the panel is mounted (conciergeEnabled). The "maybe try"
 * chips are REAL category names from the full menu — never invented dishes.
 *
 * Amber here is the AI affordance only (the ✦ spark on the concierge CTA,
 * matching the launcher button); the forest-dark CTA reuses the sanctioned
 * dark-surface gradient. Nothing amber is a plain functional fill.
 */
export function SearchEmptyState({
  query,
  venueName,
  conciergeEnabled,
  categories,
  onAskConcierge,
  onClearFilters,
  onGoToCategory,
}: {
  // Trimmed search query; "" when only dietary filters are active.
  query: string;
  venueName: string;
  conciergeEnabled: boolean;
  categories: { id: string; name: string }[];
  onAskConcierge: (text: string) => void;
  onClearFilters: () => void;
  onGoToCategory: (id: string) => void;
}) {
  const isSearching = query.length > 0;
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <div
        aria-hidden="true"
        className="flex h-16 w-16 items-center justify-center rounded-card border border-line bg-surface-elevated text-2xl text-accent shadow-card"
      >
        ✦
      </div>
      <h2 className="font-display text-xl font-bold tracking-tight text-ink">
        {isSearching
          ? `No dishes match “${query}”`
          : "No dishes match those dietary tags"}
      </h2>
      <p className="max-w-xs text-sm text-muted">
        {venueName} doesn’t serve that
        {conciergeEnabled
          ? " — but the concierge can find you something close."
          : ". Try a different search, or browse a category below."}
      </p>

      <div className="mt-1.5 flex w-full max-w-sm flex-col gap-2.5">
        {conciergeEnabled ? (
          <button
            type="button"
            onClick={() => onAskConcierge(query)}
            className="flex w-full items-center justify-center gap-2 rounded-input bg-[linear-gradient(110deg,var(--color-forest-deep),var(--color-concierge-glow))] px-4 py-3 text-sm font-bold text-white shadow-card transition hover:opacity-90"
          >
            <span aria-hidden="true" className="p2e-spark text-accent">
              ✦
            </span>
            Ask the concierge instead
          </button>
        ) : null}
        <Button variant="secondary" size="lg" onClick={onClearFilters}>
          {isSearching ? "Clear search" : "Clear filters"}
        </Button>
      </div>

      {categories.length > 0 ? (
        <div className="mt-2 w-full max-w-sm">
          <p className="text-left font-mono text-[9px] font-bold uppercase tracking-wider text-label">
            Maybe try
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => onGoToCategory(category.id)}
                className="rounded-pill border border-sand bg-surface-elevated px-3.5 py-2 text-xs font-semibold text-muted transition hover:bg-sand"
              >
                {category.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
