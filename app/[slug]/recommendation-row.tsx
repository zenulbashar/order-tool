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
}: {
  title: string;
  items: PublicItem[];
  onSelect: (item: PublicItem) => void;
}) {
  if (items.length === 0) return null;

  return (
    <section aria-label={title}>
      <h3 className="text-sm font-medium text-gray-900">{title}</h3>
      <ul className="mt-2 flex gap-3 overflow-x-auto pb-1">
        {items.map((item) => {
          // Variant-priced items advertise their lowest size as "from $X"; flat
          // items show their single price — same rule as ItemCard.
          const fromPriceCents =
            item.variants.length > 0
              ? Math.min(...item.variants.map((variant) => variant.priceCents))
              : null;

          return (
            <li key={item.id} className="shrink-0">
              <button
                type="button"
                onClick={() => onSelect(item)}
                className="flex w-32 flex-col gap-1 text-left"
              >
                {item.imageUrl ? (
                  // Arbitrary owner-supplied URL; next/image would need remote
                  // config. Lazy + async-decoded, matching ItemCard.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    loading="lazy"
                    decoding="async"
                    className="h-32 w-32 rounded-xl border border-gray-100 object-cover"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex h-32 w-32 items-center justify-center rounded-xl border border-gray-100 bg-gray-50 text-2xl font-semibold text-gray-300"
                  >
                    {item.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="line-clamp-2 text-sm font-medium text-gray-900">
                  {item.name}
                </span>
                <span className="text-sm text-gray-700">
                  {fromPriceCents !== null
                    ? `from $${formatCents(fromPriceCents)}`
                    : `$${formatCents(item.priceCents)}`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
