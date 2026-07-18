"use client";

import { useEffect, useRef, useState } from "react";

import { cx } from "@/app/_components/cx";
import { dietaryTagLabel, formatCents } from "@/lib/validation";

import type { PublicItem } from "./types";

/**
 * True when an item can go straight into the cart with no choices — no size
 * variants and no required modifier group (minSelect >= 1). These are the only
 * items the "+" quick-adds; anything needing a size/required option opens the
 * sheet instead (never a blind add). Mirrors useItemSelection's default-valid
 * rule exactly, so a quick-add line is byte-identical to one the sheet emits.
 */
function canQuickAdd(item: PublicItem): boolean {
  return (
    item.variants.length === 0 &&
    item.groups.every((group) => group.minSelect === 0)
  );
}

/**
 * A single menu item. The "+" / "Add +" is now a REAL button:
 *  - for a no-choice item it quick-adds to the cart (`onQuickAdd`) with a brief
 *    "added" tick — the cart badge also bumps;
 *  - for an item with sizes or a required option it opens the sheet (`onSelect`)
 *    so the choice is made before anything enters the cart.
 * Tapping the rest of the card (photo/name) always opens the sheet — the "see it
 * large" moment + full details. The two are sibling buttons (never nested), so
 * the markup stays valid and each is independently focusable.
 *
 * Two layouts share this component, split purely by breakpoint so the mobile
 * experience is otherwise unchanged:
 *  - **mobile (`lg:hidden`)** — horizontal row: text left, a 96px photo right,
 *    the add control over the photo's corner.
 *  - **desktop (`hidden lg:flex`)** — vertical card: photo banner (or a
 *    brand-tinted monogram at the same height) above name/price/description/tags,
 *    the "Add +" pill anchored bottom-right.
 */
export function ItemCard({
  item,
  onSelect,
  onQuickAdd,
}: {
  item: PublicItem;
  onSelect: (item: PublicItem) => void;
  // Add a no-choice item straight to the cart. Only ever called for items where
  // canQuickAdd(item) is true.
  onQuickAdd: (item: PublicItem) => void;
}) {
  const quickAdd = canQuickAdd(item);
  const [justAdded, setJustAdded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function handleAdd() {
    if (quickAdd) {
      onQuickAdd(item);
      setJustAdded(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setJustAdded(false), 1100);
    } else {
      // Needs a size/required option — open the sheet, never a blind add.
      onSelect(item);
    }
  }

  const addLabel = quickAdd ? `Add ${item.name} to cart` : `Choose ${item.name}`;

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
    <div className="relative overflow-hidden rounded-card border border-sand bg-surface-elevated text-left shadow-card transition hover:border-muted/40 hover:shadow-lift">
      {/* ---- Mobile: horizontal row ---- */}
      <button
        type="button"
        onClick={() => onSelect(item)}
        className={cx(
          "flex w-full items-start justify-between gap-4 p-3 text-left lg:hidden",
          !item.imageUrl && "pr-14",
        )}
      >
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
        {item.imageUrl ? (
          <div className="shrink-0 self-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.imageUrl}
              alt={item.name}
              loading="lazy"
              decoding="async"
              className="h-24 w-24 rounded-control border border-sand object-cover"
            />
          </div>
        ) : null}
      </button>
      {/* Mobile add control — sibling button over the photo corner (or the right
          gutter when there's no photo). */}
      <button
        type="button"
        onClick={handleAdd}
        aria-label={addLabel}
        className={cx(
          "absolute z-10 flex h-11 w-11 items-center justify-center rounded-pill text-[var(--action-contrast)] shadow-md transition active:scale-95 lg:hidden",
          item.imageUrl ? "bottom-4 right-4" : "right-3 top-1/2 -translate-y-1/2",
          // Brief pulse on quick-add (reduced-motion holds it steady). Driven by
          // the existing justAdded state, so no new interaction/logic.
          justAdded && "p2e-cartpulse",
        )}
        style={{ backgroundColor: "var(--action)" }}
      >
        {justAdded ? <CheckIcon /> : <PlusIcon />}
      </button>

      {/* ---- Desktop: compact vertical card ---- */}
      <button
        type="button"
        onClick={() => onSelect(item)}
        className="hidden w-full flex-col text-left lg:flex"
      >
        <div className="h-24 w-full overflow-hidden">
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
              className="flex h-full w-full items-center justify-center font-display text-[32px] font-extrabold"
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
        <div className="flex flex-col gap-1 p-2.5 pb-10">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 font-body text-[13px] font-semibold leading-snug text-ink">
              {item.name}
            </p>
            <p className="shrink-0 font-display text-[13px] font-semibold text-ink">
              {priceLabel}
            </p>
          </div>
          {item.description ? (
            <p className="line-clamp-2 text-[11.5px] leading-snug text-muted">
              {item.description}
            </p>
          ) : null}
          {item.tags.length > 0 ? (
            <TagList tags={item.tags.slice(0, 2)} className="mt-0.5 pr-16" />
          ) : null}
        </div>
      </button>
      {/* Desktop add control — sibling pill anchored bottom-right. */}
      <button
        type="button"
        onClick={handleAdd}
        aria-label={addLabel}
        className={cx(
          "absolute bottom-2.5 right-2.5 z-10 hidden items-center gap-0.5 rounded-control-sm px-2.5 py-1 text-[11px] font-semibold text-[var(--action-contrast)] shadow-sm transition active:scale-95 lg:inline-flex",
          justAdded && "p2e-cartpulse",
        )}
        style={{ backgroundColor: "var(--action)" }}
      >
        {justAdded ? (
          <>
            Added <CheckIcon />
          </>
        ) : (
          <>
            Add <PlusIcon />
          </>
        )}
      </button>
    </div>
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
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}
