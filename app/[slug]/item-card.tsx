import { dietaryTagLabel, formatCents } from "@/lib/validation";

import type { PublicItem } from "./types";

/**
 * A single menu item row. Tapping it opens the modifier sheet. Rendered inside
 * the client storefront, so the onClick handler is fine without its own
 * "use client" boundary.
 */
export function ItemCard({
  item,
  onSelect,
}: {
  item: PublicItem;
  onSelect: (item: PublicItem) => void;
}) {
  // Variant-priced items advertise their lowest size as "from $X"; flat items
  // show their single price. The base priceCents is ignored when variants exist.
  const fromPriceCents =
    item.variants.length > 0
      ? Math.min(...item.variants.map((variant) => variant.priceCents))
      : null;

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className="flex w-full items-start justify-between gap-4 rounded-2xl border border-sand bg-surface-elevated p-3 text-left shadow-sm transition hover:border-muted/40 hover:shadow-md"
    >
      <div className="min-w-0 flex-1">
        <p className="font-body text-sm font-semibold text-ink">{item.name}</p>
        {item.description ? (
          <p className="mt-0.5 line-clamp-2 text-sm text-muted">
            {item.description}
          </p>
        ) : null}
        {item.tags.length > 0 ? (
          <ul className="mt-1.5 flex flex-wrap gap-1">
            {item.tags.map((tag) => (
              <li
                key={tag}
                className="rounded-full bg-sand px-2 py-0.5 text-[11px] font-medium text-muted"
              >
                {dietaryTagLabel(tag)}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-1.5 text-sm font-semibold text-ink">
          {fromPriceCents !== null
            ? `from $${formatCents(fromPriceCents)}`
            : `$${formatCents(item.priceCents)}`}
        </p>
      </div>
      {/* Photo + add affordance. The "+" is a DECORATIVE span (aria-hidden), not a
          nested button — the whole card is the button and tapping anywhere,
          including the "+", still calls onSelect(item) -> the modifier sheet ->
          addItem, unchanged. The "+" wears the venue's own --brand colour. */}
      <div className="relative shrink-0 self-center">
        {item.imageUrl ? (
          // Arbitrary owner-supplied URL; next/image would need remote config.
          // Lazy + async-decoded so a photo-heavy menu stays fast on mobile.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt={item.name}
            loading="lazy"
            decoding="async"
            className="h-24 w-24 rounded-xl border border-sand object-cover"
          />
        ) : null}
        <span
          aria-hidden="true"
          className={`flex h-9 w-9 items-center justify-center rounded-full text-white shadow-md ${
            item.imageUrl ? "absolute -bottom-2 -right-2" : ""
          }`}
          style={{ backgroundColor: "var(--brand)" }}
        >
          <PlusIcon />
        </span>
      </div>
    </button>
  );
}

function PlusIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      className="h-4 w-4"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
