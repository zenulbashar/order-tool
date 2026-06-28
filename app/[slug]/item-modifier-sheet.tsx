"use client";

import { useEffect } from "react";

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

  // Lock background scroll while the sheet is open.
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

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
        className="flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-2xl bg-white sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-gray-900">
              {item.name}
            </h2>
            {item.description ? (
              <p className="mt-0.5 text-sm text-gray-500">{item.description}</p>
            ) : null}
            {item.tags.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-1">
                {item.tags.map((tag) => (
                  <li
                    key={tag}
                    className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600"
                  >
                    {dietaryTagLabel(tag)}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
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

        <div className="space-y-3 border-t border-gray-100 px-5 py-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-900">Quantity</span>
            <QuantityStepper
              quantity={quantity}
              onChange={selection.setQuantity}
            />
          </div>

          <button
            type="button"
            onClick={handleAdd}
            disabled={!allValid}
            className="w-full rounded-lg px-4 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
            style={{ backgroundColor: "var(--brand)" }}
          >
            {hasVariants && !selectedVariant
              ? "Select a size"
              : `Add to cart · $${formatCents(totalCents)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
