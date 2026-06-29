"use client";

import { type Dispatch, type SetStateAction, useMemo, useState } from "react";

import { DIETARY_DISCLAIMER, formatCents } from "@/lib/validation";

import type { PublicGroup, PublicItem, PublicVariant } from "./types";

/**
 * Shared size/variant + modifier selection for an item: the SINGLE source of
 * pricing and validation truth, used by both the single-item ItemModifierSheet
 * and the concierge multi-item picker so the two can never diverge. Display
 * pricing only — the server re-prices authoritatively at order time; the caller
 * passes the chosen ids (never a price) to the existing addItem.
 */

export type ItemSelection = {
  selectedVariantId: string | null;
  setSelectedVariantId: (id: string) => void;
  selections: Record<string, string[]>;
  selectRadio: (group: PublicGroup, optionId: string | null) => void;
  toggleCheckbox: (group: PublicGroup, optionId: string) => void;
  quantity: number;
  setQuantity: Dispatch<SetStateAction<number>>;
  hasVariants: boolean;
  selectedVariant: PublicVariant | null;
  /** True only when the size (if any) is chosen AND every required group is met. */
  allValid: boolean;
  unitCents: number;
  totalCents: number;
  selectedOptionIds: string[];
};

export function useItemSelection(
  item: PublicItem,
  options?: { initialVariantId?: string | null },
): ItemSelection {
  // A suggested size (e.g. the concierge's suggestedVariantId) is a NON-binding
  // default: applied only if it is actually a variant of this item, and the
  // customer can still change it. An unknown/foreign id is ignored, leaving the
  // size unchosen so "Add" stays gated until they pick one.
  const initialVariantId = options?.initialVariantId ?? null;
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(() =>
    initialVariantId && item.variants.some((v) => v.id === initialVariantId)
      ? initialVariantId
      : null,
  );
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [quantity, setQuantity] = useState(1);

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

  const hasVariants = item.variants.length > 0;
  const selectedVariant = hasVariants
    ? (item.variants.find((variant) => variant.id === selectedVariantId) ?? null)
    : null;
  const sizeChosen = !hasVariants || selectedVariant !== null;
  const allValid =
    sizeChosen &&
    item.groups.every(
      (group) => (selections[group.id]?.length ?? 0) >= group.minSelect,
    );

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

  // Memoised so its identity is stable across renders that don't change the
  // selection (the multi-item picker reports this up via an effect).
  const selectedOptionIds = useMemo(
    () => item.groups.flatMap((group) => selections[group.id] ?? []),
    [item.groups, selections],
  );

  // Base is the chosen size's price (variant-priced) or the item price (flat).
  const baseCents = selectedVariant ? selectedVariant.priceCents : item.priceCents;
  const unitCents = baseCents + deltaCents;
  const totalCents = unitCents * quantity;

  return {
    selectedVariantId,
    setSelectedVariantId,
    selections,
    selectRadio,
    toggleCheckbox,
    quantity,
    setQuantity,
    hasVariants,
    selectedVariant,
    allValid,
    unitCents,
    totalCents,
    selectedOptionIds,
  };
}

function groupHint(group: PublicGroup): string {
  if (group.maxSelect === 1) {
    return group.minSelect >= 1 ? "Required · choose 1" : "Optional";
  }
  const base = `Choose up to ${group.maxSelect}`;
  return group.minSelect >= 1 ? `${base} · at least ${group.minSelect}` : base;
}

/**
 * The interactive selection fields for an item: the size picker (variant-priced
 * items only, no default), the life-safety dietary note, and the modifier
 * groups. Pure presentation driven by an ItemSelection so both surfaces render
 * identical controls and validation.
 */
export function ItemSelectionFields({
  item,
  selection,
}: {
  item: PublicItem;
  selection: ItemSelection;
}) {
  const {
    selectedVariantId,
    setSelectedVariantId,
    selections,
    selectRadio,
    toggleCheckbox,
    hasVariants,
  } = selection;

  return (
    <>
      {/* Size picker (variant-priced items only). Radio list in the owner's sort
          order, each with its own price; NO default, so the customer must choose
          before the item can be added. */}
      {hasVariants ? (
        <fieldset>
          <legend className="flex w-full items-baseline justify-between">
            <span className="text-sm font-medium text-ink">Size</span>
            <span className="text-xs text-muted">Required · choose 1</span>
          </legend>
          <div className="mt-2 space-y-1.5">
            {item.variants.map((variant) => (
              <label
                key={variant.id}
                className="flex items-center justify-between gap-3 text-sm text-ink"
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`size-${item.id}`}
                    checked={selectedVariantId === variant.id}
                    onChange={() => setSelectedVariantId(variant.id)}
                    className="h-4 w-4"
                    style={{ accentColor: "var(--brand)" }}
                  />
                  {variant.name}
                </span>
                <span className="text-muted">
                  ${formatCents(variant.priceCents)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {/* LIFE-SAFETY: the tags are the venue's own labels, not a guarantee. A
          prominent, unmissable note right where the customer is about to order. */}
      {item.tags.length > 0 ? (
        <p className="flex items-start gap-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2.5 text-sm font-medium text-ink">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
            className="mt-0.5 h-5 w-5 shrink-0 text-accent"
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
              <span className="text-sm font-medium text-ink">
                {group.name}
              </span>
              <span className="text-xs text-muted">{groupHint(group)}</span>
            </legend>

            <div className="mt-2 space-y-1.5">
              {group.options.length === 0 ? (
                <p className="text-xs text-muted">No options available.</p>
              ) : null}

              {/* Optional single-select can be cleared via a "None" radio. */}
              {isRadio && group.minSelect === 0 ? (
                <label className="flex items-center justify-between gap-3 text-sm text-ink">
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`${item.id}-${group.id}`}
                      checked={selected.length === 0}
                      onChange={() => selectRadio(group, null)}
                      className="h-4 w-4"
                      style={{ accentColor: "var(--brand)" }}
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
                    className="flex items-center justify-between gap-3 text-sm text-ink"
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type={isRadio ? "radio" : "checkbox"}
                        name={isRadio ? `${item.id}-${group.id}` : undefined}
                        checked={checked}
                        disabled={!isRadio && !checked && atCap}
                        onChange={() =>
                          isRadio
                            ? selectRadio(group, option.id)
                            : toggleCheckbox(group, option.id)
                        }
                        className="h-4 w-4"
                        style={{ accentColor: "var(--brand)" }}
                      />
                      {option.name}
                    </span>
                    {option.priceDeltaCents > 0 ? (
                      <span className="text-muted">
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
    </>
  );
}

/** Shared quantity stepper (1..). Used by the sheet and the multi-item picker. */
export function QuantityStepper({
  quantity,
  onChange,
}: {
  quantity: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, quantity - 1))}
        disabled={quantity <= 1}
        aria-label="Decrease quantity"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-sand text-ink disabled:opacity-40"
      >
        −
      </button>
      <span className="w-6 text-center text-sm font-medium">{quantity}</span>
      <button
        type="button"
        onClick={() => onChange(quantity + 1)}
        aria-label="Increase quantity"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-sand text-ink"
      >
        +
      </button>
    </div>
  );
}
