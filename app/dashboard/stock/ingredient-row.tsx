"use client";

import { useState } from "react";

import { Button } from "@/app/_components/button";
import { costPerUnitCents, formatUnitCost } from "@/lib/stock/cost";
import { formatCents } from "@/lib/validation";

import { deleteIngredient, updateIngredient } from "./actions";
import { IngredientFields } from "./ingredient-fields";

import type { Ingredient } from "@/lib/db/schema";

/**
 * One ingredient — a read row that toggles into an inline edit form (design:
 * the "EDITING" row). Cost per unit is computed live from pack cost ÷ pack
 * size ÷ yield; "uncosted" when pack data is missing. The edit form posts the
 * SAME FormData shape as add via the shared IngredientFields.
 */
export function IngredientRow({
  ingredient,
  ageDays,
}: {
  ingredient: Ingredient;
  // Days since the cost was last updated (for the stale-cost badge).
  ageDays: number;
}) {
  const [editing, setEditing] = useState(false);
  const cents = costPerUnitCents(ingredient);
  const stale = cents !== null && ageDays >= 60;

  if (editing) {
    return (
      <li className="border-b border-line/60 bg-[var(--color-accent)]/[0.06] px-4 py-3 shadow-[inset_3px_0_0_var(--color-accent)]">
        <form action={updateIngredient} className="space-y-3">
          <input type="hidden" name="id" value={ingredient.id} />
          <IngredientFields defaults={ingredient} />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Save
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="grid grid-cols-[1.9fr_0.5fr_1.4fr_1.3fr_0.5fr_1.1fr_auto] items-center gap-3 border-b border-line/60 px-4 py-3 text-sm">
      <span className="flex items-center gap-2 font-bold text-ink">
        {ingredient.name}
        {ingredient.isPackaging ? (
          <span className="rounded-[5px] bg-sand px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider text-muted">
            Packaging
          </span>
        ) : null}
      </span>
      <span className="font-mono text-[11px] text-muted">{ingredient.unit}</span>
      <span className="text-xs text-muted">
        {ingredient.packSize != null && ingredient.packCostCents != null
          ? `${ingredient.packSize} ${ingredient.unit} · $${formatCents(ingredient.packCostCents)}`
          : "—"}
      </span>
      <span className="flex items-center gap-1.5">
        {cents !== null ? (
          <span className="font-display text-[13px] font-extrabold text-ink">
            {formatUnitCost(cents)}
            <span className="font-mono text-[8px] font-bold uppercase text-label">
              {" "}
              /{ingredient.unit}
            </span>
          </span>
        ) : (
          <span className="font-mono text-[10px] font-bold uppercase text-warm-deep">
            Uncosted
          </span>
        )}
        {stale ? (
          <span className="rounded-[5px] bg-[var(--color-accent)]/15 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wide text-accent-deep">
            {ageDays}d old
          </span>
        ) : null}
      </span>
      <span className="text-xs text-muted">{ingredient.yieldPct}%</span>
      <span className="truncate text-xs text-muted">
        {ingredient.supplier ?? "—"}
      </span>
      <span className="flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-control px-2 py-1 text-xs font-bold text-ink hover:bg-sand"
        >
          Edit
        </button>
        <form
          action={deleteIngredient}
          onSubmit={(event) => {
            if (!confirm(`Delete ${ingredient.name}?`)) event.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={ingredient.id} />
          <button
            type="submit"
            aria-label={`Delete ${ingredient.name}`}
            className="rounded-control px-2 py-1 text-xs font-bold text-error hover:bg-sand"
          >
            Delete
          </button>
        </form>
      </span>
    </li>
  );
}
