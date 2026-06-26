"use client";

import { useState } from "react";

import { formatCents } from "@/lib/validation";

import { deleteVariant, moveVariant } from "./actions";
import { MoveButtons } from "./move-buttons";
import { VariantForm } from "./variant-form";

/* -------------------------------------------------------------------------- */
/*  "This item has sizes" toggle.                                              */
/*                                                                            */
/*  CRITICAL: "has sizes" is DERIVED state, never a stored flag. An item is    */
/*  variant-priced iff it has >= 1 menu_item_variants row (the storefront and  */
/*  checkout both key off row presence). So this toggle WRITES NOTHING by      */
/*  itself — it only reveals/hides the existing per-size CRUD:                  */
/*                                                                            */
/*   - Flat -> ON: reveal an expanded "Add a size" form. No DB write. The item  */
/*     stays flat-priced until the owner creates a real size (createVariant,    */
/*     which validates name + price). A zero-size "sized" item can therefore    */
/*     never be persisted.                                                      */
/*   - ON -> OFF: the toggle NEVER deletes. While real sizes exist, unchecking  */
/*     is gated (we keep it checked and point the owner at each size's own      */
/*     Delete). The item becomes flat again only once the LAST size is removed  */
/*     via the existing deleteVariant — at which point this re-derives to off.  */
/*                                                                            */
/*  Because deletion only happens through the explicit per-size control, a      */
/*  misclick on the toggle can never wipe pricing data. Past orders snapshot    */
/*  their size, so removing sizes never affects order history.                  */
/* -------------------------------------------------------------------------- */

const summaryClass =
  "cursor-pointer select-none text-xs font-medium text-gray-600 hover:text-gray-900";

const deleteLink = "text-xs font-medium text-red-600 hover:text-red-700";

type VariantRow = { id: string; name: string; priceCents: number };

export function HasSizesEditor({
  itemId,
  variants,
}: {
  itemId: string;
  variants: VariantRow[];
}) {
  // Derived truth from the server data — updates after every revalidation.
  const hasSizes = variants.length > 0;
  // Ephemeral: the owner ticked the box on a flat item but hasn't added a size
  // yet. Local-only; nothing is written and the item is still flat-priced.
  const [revealEmpty, setRevealEmpty] = useState(false);
  const checked = hasSizes || revealEmpty;

  function handleToggle() {
    if (!checked) {
      // Flat -> ON: just reveal the editor. No write.
      setRevealEmpty(true);
      return;
    }
    // Attempting to switch OFF.
    if (hasSizes) {
      // Real sizes exist — never auto-delete. Keep it checked; the helper text
      // below points the owner at the per-size Delete controls.
      return;
    }
    // Revealed-but-empty: nothing was written, so just hide the editor.
    setRevealEmpty(false);
  }

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm font-medium text-gray-900">
        <input
          type="checkbox"
          checked={checked}
          onChange={handleToggle}
          className="h-4 w-4 rounded border-gray-300"
        />
        This item has sizes
      </label>

      {checked ? (
        <div className="space-y-3 rounded-md border border-gray-200 bg-gray-50/50 p-3">
          {hasSizes ? (
            <p className="text-xs text-gray-500">
              Sizes set the price — the single Price above is ignored while sizes
              exist.
            </p>
          ) : (
            <p className="text-xs text-amber-700">
              Add at least one size to switch this item to size-based pricing.
              Until you do, it keeps the single Price above.
            </p>
          )}

          {hasSizes ? (
            <ul className="space-y-1.5">
              {variants.map((variant, variantIndex) => (
                <li
                  key={variant.id}
                  className="rounded border border-gray-200 bg-white"
                >
                  <div className="flex items-center justify-between gap-3 px-3 py-1.5">
                    <p className="truncate text-sm text-gray-900">
                      {variant.name}
                      <span className="ml-2 text-gray-500">
                        ${formatCents(variant.priceCents)}
                      </span>
                    </p>
                    <MoveButtons
                      action={moveVariant}
                      id={variant.id}
                      isFirst={variantIndex === 0}
                      isLast={variantIndex === variants.length - 1}
                      label={variant.name}
                    />
                  </div>
                  <details className="border-t border-gray-100 px-3 py-1.5">
                    <summary className={summaryClass}>Edit</summary>
                    <div className="mt-3 space-y-4">
                      <VariantForm
                        variant={{
                          id: variant.id,
                          name: variant.name,
                          priceCents: variant.priceCents,
                        }}
                      />
                      <form
                        action={deleteVariant}
                        className="border-t border-gray-100 pt-3"
                      >
                        <input type="hidden" name="id" value={variant.id} />
                        <button type="submit" className={deleteLink}>
                          Delete size
                        </button>
                      </form>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          ) : null}

          {/* Add-a-size form, expanded inline (no buried <details>) so adding the
              first size is a single step. Reuses the existing createVariant. */}
          <div className="rounded border border-dashed border-gray-300 p-3">
            <p className="mb-2 text-xs font-medium text-gray-600">
              {hasSizes ? "Add another size" : "Add the first size"}
            </p>
            <VariantForm itemId={itemId} />
          </div>

          {hasSizes ? (
            <p className="text-xs text-gray-400">
              To switch back to a single price, remove every size above. Removing
              a size never affects past orders.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
