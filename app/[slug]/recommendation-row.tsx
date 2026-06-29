"use client";

import { formatCents } from "@/lib/validation";

import type { PublicItem } from "./types";

/**
 * Presentational "frequently bought together" row (#11): a horizontally
 * scrollable strip of 2–4 compact item tiles (photo + name + price), reusing the
 * item-card visual idiom. Pure UI — the parent decides which items to show and
 * what a tap does (always: re-open the existing modifier sheet for that item, so
 * required size/variant/modifier choices + pricing still happen). Renders nothing
 * when there are no items, so callers can drop it in unconditionally.
 */
export function RecommendationRow({
  title,
  items,
  onSelect,
  className,
  surface = "cream",
}: {
  title: string;
  items: PublicItem[];
  onSelect: (item: PublicItem) => void;
  // Optional wrapper classes (e.g. a separator for the cart surface). Applied to
  // the <section>, so it only renders when the row itself does — never a stray
  // empty bordered box when there are no recommendations.
  className?: string;
  // Visual context, styling only: "cream" warm tiles (the modifier sheet's
  // "Goes well with" + the cart upsell) or "dark" translucent amber-tinted cards
  // (the forest-dark concierge panel). The tap behaviour (onSelect) is identical.
  surface?: "cream" | "dark";
}) {
  if (items.length === 0) return null;

  const isDark = surface === "dark";

  return (
    <section aria-label={title} className={className}>
      <h3
        className={`text-sm font-medium ${isDark ? "text-concierge-ai-text" : "text-ink"}`}
      >
        {title}
      </h3>
      <ul className="mt-2 flex gap-3 overflow-x-auto pb-1">
        {items.map((item) => {
          // Variant-priced items advertise their lowest size as "from $X"; flat
          // items show their single price — same rule as ItemCard.
          const fromPriceCents =
            item.variants.length > 0
              ? Math.min(...item.variants.map((variant) => variant.priceCents))
              : null;
          const priceLabel =
            fromPriceCents !== null
              ? `from $${formatCents(fromPriceCents)}`
              : `$${formatCents(item.priceCents)}`;

          return (
            <li key={item.id} className="shrink-0">
              {isDark ? (
                // Dark concierge card (source spec): translucent amber-tinted
                // card with a white name, amber price, sage description, and a
                // decorative amber "+". The whole card is the button — tapping
                // anywhere (incl. the "+") still routes through onSelect.
                <button
                  type="button"
                  onClick={() => onSelect(item)}
                  className="flex h-full w-44 flex-col gap-2 rounded-[15px] border border-concierge-card-border bg-concierge-card-bg p-2.5 text-left"
                >
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      loading="lazy"
                      decoding="async"
                      className="h-28 w-full rounded-[10px] border border-concierge-ai-border object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="flex h-28 w-full items-center justify-center rounded-[10px] border border-concierge-ai-border bg-concierge-ai-bg text-2xl font-semibold text-concierge-sage"
                    >
                      {item.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="line-clamp-2 text-sm font-bold text-concierge-ai-text">
                    {item.name}
                  </span>
                  {item.description ? (
                    <span className="line-clamp-2 text-xs text-concierge-sage">
                      {item.description}
                    </span>
                  ) : null}
                  <span className="mt-auto flex items-center justify-between gap-2 pt-1">
                    <span className="font-display text-sm font-extrabold text-accent">
                      {priceLabel}
                    </span>
                    <span
                      aria-hidden="true"
                      className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-accent text-lg font-semibold text-brand"
                    >
                      +
                    </span>
                  </span>
                </button>
              ) : (
                // Cream warm tile (modifier sheet / cart): compact photo + name +
                // price, same idiom as ItemCard.
                <button
                  type="button"
                  onClick={() => onSelect(item)}
                  className="flex w-32 flex-col gap-1 text-left"
                >
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      loading="lazy"
                      decoding="async"
                      className="h-32 w-32 rounded-xl border border-sand object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="flex h-32 w-32 items-center justify-center rounded-xl border border-sand bg-sand text-2xl font-semibold text-muted"
                    >
                      {item.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="line-clamp-2 text-sm font-medium text-ink">
                    {item.name}
                  </span>
                  <span className="text-sm text-ink">{priceLabel}</span>
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
