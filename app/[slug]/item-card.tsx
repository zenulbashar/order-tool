import { dietaryTagLabel, formatCents } from "@/lib/validation";

import type { PublicItem } from "./types";

/**
 * A single menu item. Tapping anywhere on the card opens the modifier sheet
 * (which handles size/variant/modifier choices + pricing before anything enters
 * the cart), so the whole card is one button and the "+" / "Add +" affordances
 * are decorative (aria-hidden), never nested buttons.
 *
 * Two layouts share this one button, split purely by breakpoint so the mobile
 * experience is byte-for-byte unchanged:
 *  - **mobile (`lg:hidden`)** — the original horizontal row: text left, a 96px
 *    photo + brand "+" right.
 *  - **desktop (`hidden lg:flex`)** — Direction A's vertical card: a photo banner
 *    (or a brand-tinted monogram when the item has no photo, at the SAME height
 *    so a mixed grid never looks ragged) above name/price, description, and a
 *    tags + "Add +" row.
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
  const priceLabel =
    fromPriceCents !== null
      ? `from $${formatCents(fromPriceCents)}`
      : `$${formatCents(item.priceCents)}`;

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className="block w-full overflow-hidden rounded-card border border-sand bg-surface-elevated text-left shadow-card transition hover:border-muted/40 hover:shadow-lift"
    >
      {/* ---- Mobile: horizontal row (unchanged) ---- */}
      <div className="flex items-start justify-between gap-4 p-3 lg:hidden">
        <div className="min-w-0 flex-1">
          <p className="font-body text-sm font-semibold text-ink">{item.name}</p>
          {item.description ? (
            <p className="mt-0.5 line-clamp-2 text-sm text-muted">
              {item.description}
            </p>
          ) : null}
          {item.tags.length > 0 ? <TagList tags={item.tags} className="mt-1.5" /> : null}
          <p className="mt-1.5 font-display text-base font-semibold text-ink">
            {priceLabel}
          </p>
        </div>
        <div className="relative shrink-0 self-center">
          {item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.imageUrl}
              alt={item.name}
              loading="lazy"
              decoding="async"
              className="h-24 w-24 rounded-control border border-sand object-cover"
            />
          ) : null}
          <span
            aria-hidden="true"
            className={`flex h-9 w-9 items-center justify-center rounded-pill text-[var(--action-contrast)] shadow-md ${
              item.imageUrl ? "absolute -bottom-2 -right-2" : ""
            }`}
            style={{ backgroundColor: "var(--action)" }}
          >
            <PlusIcon />
          </span>
        </div>
      </div>

      {/* ---- Desktop: vertical card ---- */}
      <div className="hidden lg:flex lg:flex-col">
        <div className="h-[140px] w-full overflow-hidden">
          {item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.imageUrl}
              alt={item.name}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-full w-full items-center justify-center font-display text-[46px] font-extrabold"
              style={{
                background:
                  "color-mix(in srgb, var(--brand) 9%, var(--color-surface))",
                color: "color-mix(in srgb, var(--brand) 42%, transparent)",
              }}
            >
              {item.name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-2 p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 font-body text-[15px] font-semibold text-ink">
              {item.name}
            </p>
            <p className="shrink-0 font-display text-[15px] font-semibold text-ink">
              {priceLabel}
            </p>
          </div>
          {item.description ? (
            <p className="line-clamp-2 text-[12.5px] leading-relaxed text-muted">
              {item.description}
            </p>
          ) : null}
          <div className="mt-0.5 flex items-center justify-between gap-3">
            {item.tags.length > 0 ? (
              <TagList tags={item.tags} className="min-w-0" />
            ) : (
              <span />
            )}
            <span
              aria-hidden="true"
              className="inline-flex shrink-0 items-center gap-1 rounded-control-sm px-3.5 py-2 text-xs font-semibold text-[var(--action-contrast)]"
              style={{ backgroundColor: "var(--action)" }}
            >
              Add <PlusIcon />
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

/** Dietary tag chips — plant tags read positive (green), the rest neutral. */
function TagList({
  tags,
  className = "",
}: {
  tags: PublicItem["tags"];
  className?: string;
}) {
  return (
    <ul className={`flex flex-wrap gap-1 ${className}`}>
      {tags.map((tag) => {
        const plant = tag === "vegan" || tag === "vegetarian";
        return (
          <li
            key={tag}
            className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider ${
              plant
                ? "bg-[var(--color-success)]/12 text-success-deep"
                : "bg-sand text-muted"
            }`}
          >
            {dietaryTagLabel(tag)}
          </li>
        );
      })}
    </ul>
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
