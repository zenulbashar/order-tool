"use client";

import { Button } from "@/app/_components/button";
import { useDialog } from "@/app/_components/use-dialog";
import { dietaryTagLabel, formatCents } from "@/lib/validation";

import {
  ItemSelectionFields,
  QuantityStepper,
  useItemSelection,
} from "./item-selection";
import { ItemGoesWellWith } from "./recommendations";
import type { PublicItem } from "./types";

/**
 * The single-item add sheet. Size/variant + modifier selection, validation, and
 * display pricing all come from the shared useItemSelection hook (the same one
 * the concierge multi-item picker uses), rendered via ItemSelectionFields, so
 * the two surfaces can never diverge. "Add to cart" stays disabled until a size
 * is chosen AND every required group is satisfied. The actual add is provided by
 * the parent (the existing addItem — the only cart write).
 */
export function ItemModifierSheet({
  item,
  onClose,
  onAdd,
  onSelectItem,
}: {
  item: PublicItem;
  onClose: () => void;
  onAdd?: (
    itemId: string,
    variantId: string | null,
    selectedOptionIds: string[],
    quantity: number,
  ) => void;
  // Open another item through this same sheet — used by the "Goes well with…"
  // row so a recommended item still goes through required selections + pricing,
  // never a blind add. Absent => the row is not rendered.
  onSelectItem?: (item: PublicItem) => void;
}) {
  const selection = useItemSelection(item);
  const { hasVariants, selectedVariant, allValid, totalCents, quantity } =
    selection;

  // Focus trap + initial focus + focus restoration + Escape + scroll lock.
  const panelRef = useDialog<HTMLDivElement>(onClose);

  function handleAdd() {
    if (!allValid) return;
    // Pass ONLY the chosen variant id (null for flat items) — never a price. The
    // server looks the price up from the DB and re-validates this id at checkout.
    onAdd?.(
      item.id,
      selectedVariant?.id ?? null,
      selection.selectedOptionIds,
      quantity,
    );
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={item.name}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className={`flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-card bg-surface-elevated sm:rounded-card ${
          item.imageUrl ? "lg:h-[min(640px,85dvh)] lg:max-w-3xl lg:flex-row" : ""
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        {/* Big hero image of the dish when it has one — the "see it large on
            tap" moment. Mobile: a tall banner above the details. Desktop: a
            full-height left pane beside the selections, so the size/option
            controls get real room. Owner-supplied URL; next/image would need
            remote config. */}
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt={item.name}
            className="h-52 w-full shrink-0 object-cover sm:h-60 lg:h-full lg:w-[44%]"
          />
        ) : null}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-sand px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold tracking-tight text-ink">
              {item.name}
            </h2>
            {item.description ? (
              <p className="mt-0.5 text-sm text-muted">{item.description}</p>
            ) : null}
            {item.tags.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-1">
                {item.tags.map((tag) => {
                  // Firewall-safe semantic tint (matches the item card): plant
                  // tags read positive green, everything else neutral. No amber.
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
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-pill text-muted hover:bg-sand hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <ItemSelectionFields item={item} selection={selection} />

          {/* "Goes well with…" — aggregate, venue-scoped recommendations.
              Tapping one re-opens THIS sheet for that item (onSelectItem), so any
              required size/modifier choice + pricing still happens — never a
              blind add. Hidden when there is no usable signal. */}
          {onSelectItem ? (
            <ItemGoesWellWith anchorId={item.id} onSelect={onSelectItem} />
          ) : null}
        </div>

        <div className="space-y-3 border-t border-sand px-5 py-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-ink">Quantity</span>
            <QuantityStepper
              quantity={quantity}
              onChange={selection.setQuantity}
            />
          </div>

          <Button
            type="button"
            variant="primary"
            onClick={handleAdd}
            disabled={!allValid}
            className="w-full"
          >
            {hasVariants && !selectedVariant
              ? "Select a size"
              : `Add to cart · $${formatCents(totalCents)}`}
          </Button>
        </div>
        </div>
      </div>
    </div>
  );
}
