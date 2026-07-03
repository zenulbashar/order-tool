"use client";

import { useState } from "react";

import { Button } from "@/app/_components/button";
import { costPerUnitCents, formatUnitCost, isLowStock } from "@/lib/stock/cost";
import { formatCents } from "@/lib/validation";

import { adjustStock, deleteIngredient, updateIngredient } from "./actions";
import { IngredientFields } from "./ingredient-fields";

import type { Ingredient } from "@/lib/db/schema";

/** Compact quantity: whole numbers bare, otherwise up to 2 dp. */
function formatQty(qty: number): string {
  return Number.isInteger(qty) ? String(qty) : qty.toFixed(2).replace(/\.?0+$/, "");
}

/**
 * One ingredient — a read row that toggles into an inline edit form OR a stock-
 * adjust form (Track D · D4a). Cost per unit is computed live; on-hand comes
 * from the stock ledger (a cached counter) and a low-stock badge shows when it
 * drops below par. The edit form posts the SAME FormData shape as add via the
 * shared IngredientFields; stock changes go through the ledger action so on-hand
 * is never edited as a plain field.
 */
export function IngredientRow({
  ingredient,
  ageDays,
}: {
  ingredient: Ingredient;
  // Days since the cost was last updated (for the stale-cost badge).
  ageDays: number;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "stock">("view");
  const cents = costPerUnitCents(ingredient);
  const stale = cents !== null && ageDays >= 60;
  const low = isLowStock(ingredient);

  if (mode === "edit") {
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
              onClick={() => setMode("view")}
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

  if (mode === "stock") {
    return (
      <li className="border-b border-line/60 bg-hover-secondary px-4 py-3">
        <StockAdjustForm
          ingredient={ingredient}
          onDone={() => setMode("view")}
        />
      </li>
    );
  }

  return (
    <li className="grid grid-cols-[1.7fr_0.4fr_1.3fr_1.2fr_1.1fr_0.5fr_1fr_auto] items-center gap-3 border-b border-line/60 px-4 py-3 text-sm">
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
      {/* On hand — from the ledger. Null = never counted ("not tracked"). */}
      <span className="flex items-center gap-1.5">
        {ingredient.onHandQty == null ? (
          <span className="font-mono text-[10px] text-label">Not tracked</span>
        ) : (
          <span className="font-display text-[13px] font-extrabold text-ink">
            {formatQty(ingredient.onHandQty)}
            <span className="font-mono text-[8px] font-bold uppercase text-label">
              {" "}
              {ingredient.unit}
            </span>
          </span>
        )}
        {low ? (
          <span className="rounded-[5px] bg-warm/15 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wide text-warm-deep">
            Low
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
          onClick={() => setMode("stock")}
          className="rounded-control px-2 py-1 text-xs font-bold text-ink hover:bg-sand"
        >
          Stock
        </button>
        <button
          type="button"
          onClick={() => setMode("edit")}
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

/**
 * The inline stock-adjust form. Three modes map to ledger movements: Receive a
 * delivery (+), Remove waste/usage (−), or Set the counted level (=). The
 * current on-hand is shown so a "Set" reconciles against a real number.
 */
function StockAdjustForm({
  ingredient,
  onDone,
}: {
  ingredient: Ingredient;
  onDone: () => void;
}) {
  const [selMode, setSelMode] = useState<"receive" | "remove" | "set">(
    ingredient.onHandQty == null ? "set" : "receive",
  );

  const control =
    "rounded-input border border-line bg-surface-elevated px-2.5 py-2 text-sm text-ink shadow-sm focus-visible:border-[var(--color-accent)] focus-visible:shadow-[var(--focus-ring-input)] focus-visible:outline-none";

  return (
    <form action={adjustStock} className="space-y-3">
      <input type="hidden" name="id" value={ingredient.id} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-ink">{ingredient.name}</span>
        <span className="font-mono text-[11px] text-muted">
          On hand:{" "}
          {ingredient.onHandQty == null
            ? "not tracked"
            : `${formatQty(ingredient.onHandQty)} ${ingredient.unit}`}
        </span>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="mb-1 block font-mono text-[9px] font-bold uppercase tracking-wider text-label">
            Action
          </span>
          <select
            name="mode"
            value={selMode}
            onChange={(event) =>
              setSelMode(event.target.value as "receive" | "remove" | "set")
            }
            className={control}
          >
            <option value="receive">Receive (+)</option>
            <option value="remove">Remove (−)</option>
            <option value="set">Set count (=)</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block font-mono text-[9px] font-bold uppercase tracking-wider text-label">
            {selMode === "set" ? `New count (${ingredient.unit})` : `Qty (${ingredient.unit})`}
          </span>
          <input
            name="qty"
            inputMode="decimal"
            required
            placeholder="0"
            className={`${control} w-28`}
          />
        </label>
        <label className="block min-w-[10rem] flex-1">
          <span className="mb-1 block font-mono text-[9px] font-bold uppercase tracking-wider text-label">
            Note (optional)
          </span>
          <input
            name="note"
            maxLength={200}
            placeholder={selMode === "receive" ? "Delivery #1234" : "Reason"}
            className={`${control} w-full`}
          />
        </label>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm">
            Save
          </Button>
        </div>
      </div>
    </form>
  );
}
