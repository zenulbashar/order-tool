"use client";

import { cx } from "@/app/_components/cx";
import { formatCents } from "@/lib/validation";

import { moveItem } from "./actions";
import { MoveButtons } from "./move-buttons";

type ItemRowData = {
  id: string;
  name: string;
  priceCents: number;
  imageUrl: string | null;
  isAvailable: boolean;
};

type VariantRow = { id: string; name: string; priceCents: number };

/**
 * One item as a selectable row in the list pane (master-detail). Shows just
 * enough to identify the item — thumbnail, name, price ("from $X" for sized
 * items) and availability/size badges. Clicking selects it (the parent drives
 * the `?item=` URL param); the full editor lives in the detail pane, no longer
 * an inline accordion. Reorder stays the same per-row moveItem form.
 */
export function ItemRow({
  item,
  variants,
  itemIndex,
  itemCount,
  isSelected,
  onSelect,
}: {
  item: ItemRowData;
  variants: VariantRow[];
  itemIndex: number;
  itemCount: number;
  isSelected: boolean;
  onSelect: () => void;
}) {
  // Mirror the storefront: a variant-priced item advertises its lowest size as
  // "from $X"; a flat item shows its single price.
  const fromPriceCents =
    variants.length > 0
      ? Math.min(...variants.map((variant) => variant.priceCents))
      : null;

  return (
    <li>
      <div
        className={cx(
          "flex items-center justify-between gap-2 rounded-control border-l-2 px-3 py-2 transition",
          isSelected
            ? "border-l-[var(--color-accent)] bg-[var(--color-accent)]/8"
            : "border-l-transparent bg-sand/40 hover:bg-sand/70",
        )}
      >
        <button
          type="button"
          onClick={onSelect}
          aria-current={isSelected ? "true" : undefined}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {item.imageUrl ? (
            // Owner-supplied URL; next/image would need remote config.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.imageUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-6 w-6 shrink-0 rounded-md border border-line object-cover"
            />
          ) : null}
          <span className="min-w-0">
            <span className="block truncate text-sm text-ink">{item.name}</span>
            <span className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-muted">
              <span>
                {fromPriceCents !== null
                  ? `from $${formatCents(fromPriceCents)}`
                  : `$${formatCents(item.priceCents)}`}
              </span>
              {variants.length > 0 ? (
                <span className="rounded bg-sand px-1 py-0.5 text-[10px] text-muted">
                  {variants.length} size{variants.length === 1 ? "" : "s"}
                </span>
              ) : null}
              {!item.isAvailable ? (
                <span className="rounded bg-sand px-1 py-0.5 text-[10px] text-muted">
                  Unavailable
                </span>
              ) : null}
            </span>
          </span>
        </button>
        <MoveButtons
          action={moveItem}
          id={item.id}
          isFirst={itemIndex === 0}
          isLast={itemIndex === itemCount - 1}
          label={item.name}
        />
      </div>
    </li>
  );
}
