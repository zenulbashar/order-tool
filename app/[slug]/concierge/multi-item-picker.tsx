"use client";

import { useCallback, useEffect, useState } from "react";

import { DIETARY_DISCLAIMER, formatCents } from "@/lib/validation";

import {
  ItemSelectionFields,
  QuantityStepper,
  useItemSelection,
} from "../item-selection";
import type { PublicItem } from "../types";

/**
 * Concierge "Review & add all" sheet. Lists every AI-suggested item, each with
 * its OWN size/variant + modifier selectors (the shared useItemSelection — the
 * same logic + validation + pricing the single-item sheet uses), pre-selecting
 * the concierge's suggestedVariantId as a CHANGEABLE default.
 *
 * MONEY-SAFE: nothing is added until the customer has satisfied every required
 * choice on every row AND tapped "Add all to cart". No item is ever added at a
 * guessed/defaulted price. The cart is still written ONLY by the existing
 * addItem, called once per row with the customer's chosen variant/options.
 */

export type ConciergePick = {
  item: PublicItem;
  suggestedVariantId: string | null;
};

export type AddLine = {
  itemId: string;
  variantId: string | null;
  selectedOptionIds: string[];
  quantity: number;
};

type RowReport = { valid: boolean; line: AddLine };

export function MultiItemPicker({
  picks,
  onAddAll,
  onClose,
}: {
  picks: ConciergePick[];
  // Called once, on "Add all", and only when every row is valid. The parent adds
  // each line via the existing addItem (the only cart write).
  onAddAll: (lines: AddLine[]) => void;
  onClose: () => void;
}) {
  // Each row reports its live validity + chosen line up here, keyed by item id.
  const [reports, setReports] = useState<Map<string, RowReport>>(new Map());

  const report = useCallback((id: string, next: RowReport) => {
    setReports((prev) => {
      const updated = new Map(prev);
      updated.set(id, next);
      return updated;
    });
  }, []);

  // Lock background scroll while the sheet is open.
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const remaining = picks.filter(
    (pick) => !reports.get(pick.item.id)?.valid,
  ).length;
  const allValid = picks.length > 0 && remaining === 0;

  function handleAddAll() {
    if (!allValid) return;
    const lines = picks
      .map((pick) => reports.get(pick.item.id)?.line)
      .filter((line): line is AddLine => line !== undefined);
    onAddAll(lines);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Review and add suggestions"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-2xl bg-white sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-gray-900">
              Review and add
            </h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Choose any required size or options for each item, then add them all
              to your cart.
            </p>
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

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4">
          {picks.map((pick) => (
            <PickerRow
              key={pick.item.id}
              item={pick.item}
              suggestedVariantId={pick.suggestedVariantId}
              onReport={report}
            />
          ))}
          <p className="text-xs text-gray-400">
            Suggestions use the venue’s dietary tags as a guide, not a guarantee.{" "}
            {DIETARY_DISCLAIMER}
          </p>
        </div>

        <div className="border-t border-gray-100 px-5 py-4">
          <button
            type="button"
            onClick={handleAddAll}
            disabled={!allValid}
            className="w-full rounded-lg px-4 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
            style={{ backgroundColor: "var(--brand)" }}
          >
            {allValid
              ? "Add all to cart"
              : `Choose options for ${remaining} ${remaining === 1 ? "item" : "items"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function PickerRow({
  item,
  suggestedVariantId,
  onReport,
}: {
  item: PublicItem;
  suggestedVariantId: string | null;
  onReport: (id: string, report: RowReport) => void;
}) {
  const selection = useItemSelection(item, {
    initialVariantId: suggestedVariantId,
  });
  const { allValid, selectedVariant, selectedOptionIds, quantity, hasVariants } =
    selection;

  // Report validity + the chosen line up to the parent whenever they change. The
  // deps are stable across unrelated re-renders (selectedOptionIds is memoised,
  // selectedVariant is a stable menu reference, onReport is a stable callback),
  // so this does not loop when the parent re-renders.
  useEffect(() => {
    onReport(item.id, {
      valid: allValid,
      line: {
        itemId: item.id,
        variantId: selectedVariant?.id ?? null,
        selectedOptionIds,
        quantity,
      },
    });
  }, [item.id, allValid, selectedVariant, selectedOptionIds, quantity, onReport]);

  const fromPriceCents =
    item.variants.length > 0
      ? Math.min(...item.variants.map((variant) => variant.priceCents))
      : null;
  const priceLabel =
    hasVariants && !selectedVariant
      ? `from $${formatCents(fromPriceCents ?? 0)}`
      : `$${formatCents(selection.totalCents)}`;

  return (
    <div className="space-y-3 border-b border-gray-100 pb-5 last:border-b-0 last:pb-0">
      <div className="flex items-start gap-3">
        {item.imageUrl ? (
          // Arbitrary owner-supplied URL; next/image would need remote config.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt={item.name}
            loading="lazy"
            decoding="async"
            className="h-16 w-16 shrink-0 rounded-xl border border-gray-100 object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-gray-100 bg-gray-50 text-xl font-semibold text-gray-300"
          >
            {item.name.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900">{item.name}</p>
          {item.description ? (
            <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">
              {item.description}
            </p>
          ) : null}
          <p className="mt-0.5 text-sm text-gray-700">{priceLabel}</p>
        </div>
      </div>

      <ItemSelectionFields item={item} selection={selection} />

      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-900">Quantity</span>
        <QuantityStepper quantity={quantity} onChange={selection.setQuantity} />
      </div>
    </div>
  );
}
