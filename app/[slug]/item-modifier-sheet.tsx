"use client";

import { useEffect, useMemo, useState } from "react";

import {
  DIETARY_DISCLAIMER,
  dietaryTagLabel,
  formatCents,
} from "@/lib/validation";

import type { PublicGroup, PublicItem } from "./types";

/**
 * Maps the item's options to the selection UI:
 *  - SIZE (variant-priced items only): a required radio list of sizes with NO
 *    default — the customer must pick one. Flat-priced items show no size picker.
 *  - max_select === 1  -> radios. Required (min_select >= 1) has no "None";
 *    optional (min_select === 0) gets a "None" choice so it can be cleared.
 *  - max_select > 1    -> checkboxes, capped at max_select; min_select enforced.
 *
 * Running total is DISPLAY ONLY (base = chosen size's price + modifier deltas).
 * "Add to cart" stays disabled until a size is chosen AND every required group is
 * satisfied. The actual add is provided by the parent.
 */
export function ItemModifierSheet({
  item,
  onClose,
  onAdd,
}: {
  item: PublicItem;
  onClose: () => void;
  onAdd?: (
    itemId: string,
    variantId: string | null,
    selectedOptionIds: string[],
    quantity: number,
  ) => void;
}) {
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  // The chosen size for a variant-priced item. No default — the customer MUST
  // pick one, and "Add to cart" stays disabled until they do.
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    null,
  );
  const [quantity, setQuantity] = useState(1);

  // Lock background scroll while the sheet is open.
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  function selectRadio(group: PublicGroup, optionId: string | null) {
    setSelections((prev) => ({
      ...prev,
      [group.id]: optionId ? [optionId] : [],
    }));
  }

  function toggleCheckbox(group: PublicGroup, optionId: string) {
    setSelections((prev) => {
      const current = prev[group.id] ?? [];
      if (current.includes(optionId)) {
        return { ...prev, [group.id]: current.filter((id) => id !== optionId) };
      }
      if (current.length >= group.maxSelect) return prev; // at cap
      return { ...prev, [group.id]: [...current, optionId] };
    });
  }

  const isSatisfied = (group: PublicGroup) =>
    (selections[group.id]?.length ?? 0) >= group.minSelect;

  // A variant-priced item must have a size chosen before it can be added; a
  // flat-priced item has no size to choose. Modifiers layer on top either way.
  const hasVariants = item.variants.length > 0;
  const selectedVariant = hasVariants
    ? (item.variants.find((variant) => variant.id === selectedVariantId) ?? null)
    : null;
  const sizeChosen = !hasVariants || selectedVariant !== null;
  const allValid = sizeChosen && item.groups.every(isSatisfied);

  const deltaCents = useMemo(() => {
    let sum = 0;
    for (const group of item.groups) {
      const selected = selections[group.id] ?? [];
      for (const option of group.options) {
        if (selected.includes(option.id)) sum += option.priceDeltaCents;
      }
    }
    return sum;
  }, [item.groups, selections]);

  // Base is the chosen size's price (variant-priced) or the item price (flat).
  // Display only; the server re-prices from its own DB lookup at order time.
  const baseCents = selectedVariant
    ? selectedVariant.priceCents
    : item.priceCents;
  const totalCents = (baseCents + deltaCents) * quantity;

  function groupHint(group: PublicGroup): string {
    if (group.maxSelect === 1) {
      return group.minSelect >= 1 ? "Required · choose 1" : "Optional";
    }
    const base = `Choose up to ${group.maxSelect}`;
    return group.minSelect >= 1 ? `${base} · at least ${group.minSelect}` : base;
  }

  function handleAdd() {
    if (!allValid) return;
    const selectedOptionIds = item.groups.flatMap((g) => selections[g.id] ?? []);
    // Pass ONLY the chosen variant id (null for flat items) — never a price. The
    // server looks the price up from the DB and re-validates this id at checkout.
    onAdd?.(item.id, selectedVariant?.id ?? null, selectedOptionIds, quantity);
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
          {/* Size picker (variant-priced items only). Radio list in the owner's
              sort order, each with its own price; NO default, so the customer
              must choose before "Add to cart" enables. */}
          {hasVariants ? (
            <fieldset>
              <legend className="flex w-full items-baseline justify-between">
                <span className="text-sm font-medium text-gray-900">Size</span>
                <span className="text-xs text-gray-400">Required · choose 1</span>
              </legend>
              <div className="mt-2 space-y-1.5">
                {item.variants.map((variant) => (
                  <label
                    key={variant.id}
                    className="flex items-center justify-between gap-3 text-sm text-gray-700"
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="size-variant"
                        checked={selectedVariantId === variant.id}
                        onChange={() => setSelectedVariantId(variant.id)}
                        className="h-4 w-4"
                      />
                      {variant.name}
                    </span>
                    <span className="text-gray-500">
                      ${formatCents(variant.priceCents)}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          {/* LIFE-SAFETY: tags above are the venue's own labels, not a
              guarantee. A prominent, unmissable note right where the customer is
              about to order — never a faint caption. */}
          {item.tags.length > 0 ? (
            <p className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-900">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
                className="mt-0.5 h-5 w-5 shrink-0"
              >
                <path
                  fillRule="evenodd"
                  d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z"
                  clipRule="evenodd"
                />
              </svg>
              <span>
                Dietary tags are a guide set by the venue, not a guarantee.{" "}
                {DIETARY_DISCLAIMER}
              </span>
            </p>
          ) : null}
          {item.groups.map((group) => {
            const selected = selections[group.id] ?? [];
            const isRadio = group.maxSelect === 1;
            const atCap = !isRadio && selected.length >= group.maxSelect;
            return (
              <fieldset key={group.id}>
                <legend className="flex w-full items-baseline justify-between">
                  <span className="text-sm font-medium text-gray-900">
                    {group.name}
                  </span>
                  <span className="text-xs text-gray-400">
                    {groupHint(group)}
                  </span>
                </legend>

                <div className="mt-2 space-y-1.5">
                  {group.options.length === 0 ? (
                    <p className="text-xs text-gray-400">No options available.</p>
                  ) : null}

                  {/* Optional single-select can be cleared via a "None" radio. */}
                  {isRadio && group.minSelect === 0 ? (
                    <label className="flex items-center justify-between gap-3 text-sm text-gray-700">
                      <span className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={group.id}
                          checked={selected.length === 0}
                          onChange={() => selectRadio(group, null)}
                          className="h-4 w-4"
                        />
                        None
                      </span>
                    </label>
                  ) : null}

                  {group.options.map((option) => {
                    const checked = selected.includes(option.id);
                    return (
                      <label
                        key={option.id}
                        className="flex items-center justify-between gap-3 text-sm text-gray-700"
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type={isRadio ? "radio" : "checkbox"}
                            name={isRadio ? group.id : undefined}
                            checked={checked}
                            disabled={!isRadio && !checked && atCap}
                            onChange={() =>
                              isRadio
                                ? selectRadio(group, option.id)
                                : toggleCheckbox(group, option.id)
                            }
                            className="h-4 w-4"
                          />
                          {option.name}
                        </span>
                        {option.priceDeltaCents > 0 ? (
                          <span className="text-gray-500">
                            +${formatCents(option.priceDeltaCents)}
                          </span>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}
        </div>

        <div className="space-y-3 border-t border-gray-100 px-5 py-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-900">Quantity</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                aria-label="Decrease quantity"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 text-gray-700 disabled:opacity-40"
              >
                −
              </button>
              <span className="w-6 text-center text-sm font-medium">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity((q) => q + 1)}
                aria-label="Increase quantity"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 text-gray-700"
              >
                +
              </button>
            </div>
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
