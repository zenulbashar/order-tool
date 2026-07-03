"use client";

import { useState } from "react";

import { Button } from "@/app/_components/button";
import { cx } from "@/app/_components/cx";
import {
  dishCost,
  marginOf,
  recipeLineCostCents,
} from "@/lib/stock/cost";
import { formatCents } from "@/lib/validation";

import {
  addRecipeLine,
  removeRecipeLine,
  updateRecipeLine,
} from "./recipe-actions";

export type RecipeLineData = {
  id: string;
  menuItemId: string;
  ingredientId: string;
  qty: number;
  ingredientName: string;
  unit: "g" | "ml" | "each";
  packSize: number | null;
  packCostCents: number | null;
  yieldPct: number;
  isPackaging: boolean;
};

export type IngredientOption = {
  id: string;
  name: string;
  unit: "g" | "ml" | "each";
  isPackaging: boolean;
};

export type VariantEconomics = { name: string; priceCents: number };

/** Below this margin a dish is flagged (design's 65% target). */
const TARGET_MARGIN = 0.65;

/**
 * Recipe & cost editor for a menu item (Track D · D2). Lists recipe lines with
 * a live per-line cost, an inline add row (pick ingredient + qty), and a dish-
 * economics panel (cost vs price → margin bar). All costs derive from the
 * ingredient library via lib/stock/cost.ts — update a pack price once and every
 * dish recomputes. Recipe lines have their OWN actions; the item's core
 * FormData contract is untouched.
 */
export function RecipeEditor({
  itemId,
  priceCents,
  lines,
  ingredientOptions,
  variants,
}: {
  itemId: string;
  priceCents: number;
  lines: RecipeLineData[];
  ingredientOptions: IngredientOption[];
  variants: VariantEconomics[];
}) {
  const cost = dishCost(
    lines.map((line) => ({
      qty: line.qty,
      ingredient: {
        packSize: line.packSize,
        packCostCents: line.packCostCents,
        yieldPct: line.yieldPct,
      },
    })),
  );
  const margin = marginOf(priceCents, cost.totalCents);
  const marginPct = margin ? Math.round(margin.fraction * 100) : null;
  const healthy = margin ? margin.fraction >= TARGET_MARGIN : false;

  // Only offer ingredients not already on the recipe.
  const usedIds = new Set(lines.map((line) => line.ingredientId));
  const addable = ingredientOptions.filter((opt) => !usedIds.has(opt.id));

  return (
    <div className="grid gap-4 lg:grid-cols-[1.3fr_300px]">
      <div className="space-y-2">
        <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-label">
          Recipe · per serve
        </p>

        {lines.length === 0 ? (
          <p className="text-xs text-muted">
            No ingredients yet. Add the ingredients this dish uses to see its
            true cost and margin.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {lines.map((line) => {
              const lineCost = recipeLineCostCents({
                qty: line.qty,
                ingredient: {
                  packSize: line.packSize,
                  packCostCents: line.packCostCents,
                  yieldPct: line.yieldPct,
                },
              });
              return (
                <li
                  key={line.id}
                  className="flex items-center gap-2.5 rounded-input border border-line bg-surface-elevated px-2.5 py-2"
                >
                  <form
                    action={updateRecipeLine}
                    className="flex items-center gap-2"
                  >
                    <input type="hidden" name="id" value={line.id} />
                    <input type="hidden" name="menuItemId" value={itemId} />
                    <input
                      name="qty"
                      inputMode="decimal"
                      defaultValue={line.qty}
                      aria-label={`Quantity of ${line.ingredientName}`}
                      className="w-14 rounded-md border border-line bg-surface-elevated px-2 py-1 text-center text-sm text-ink focus-visible:border-[var(--color-accent)] focus-visible:shadow-[var(--focus-ring-input)] focus-visible:outline-none"
                    />
                    <span className="w-8 font-mono text-[10px] text-muted">
                      {line.unit}
                    </span>
                    <button
                      type="submit"
                      className="text-[10px] font-bold text-[var(--action)] hover:opacity-80"
                    >
                      Save
                    </button>
                  </form>
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-ink">
                      {line.ingredientName}
                    </span>
                    {line.isPackaging ? (
                      <span className="rounded-[5px] bg-sand px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider text-muted">
                        Packaging
                      </span>
                    ) : null}
                  </span>
                  <span className="font-display text-xs font-extrabold text-ink">
                    {lineCost === null ? "—" : `$${formatCents(Math.round(lineCost))}`}
                  </span>
                  <form action={removeRecipeLine}>
                    <input type="hidden" name="id" value={line.id} />
                    <input type="hidden" name="menuItemId" value={itemId} />
                    <button
                      type="submit"
                      aria-label={`Remove ${line.ingredientName}`}
                      className="text-xs font-bold text-error hover:opacity-80"
                    >
                      ✕
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}

        {addable.length > 0 ? <AddRecipeLine itemId={itemId} options={addable} /> : null}

        <div className="mt-1 flex items-center justify-between rounded-input bg-hover-secondary px-3 py-2.5">
          <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-label">
            Dish cost · {cost.lineCount} {cost.lineCount === 1 ? "line" : "lines"}
          </span>
          <span className="font-display text-[15px] font-extrabold text-ink">
            ${formatCents(cost.totalCents)}
          </span>
        </div>
        {cost.uncostedLines > 0 ? (
          <p className="text-[11px] font-semibold text-warm-deep">
            {cost.uncostedLines} ingredient
            {cost.uncostedLines === 1 ? " has" : "s have"} no cost yet — the dish
            cost is incomplete until you set a pack price in Stock.
          </p>
        ) : null}
      </div>

      {/* Dish economics panel. */}
      <div className="space-y-3">
        <div className="rounded-card border border-line bg-surface-elevated p-4 shadow-card">
          <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-label">
            Dish economics
          </p>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-xs text-muted">Dish cost</span>
            <span className="font-display text-xl font-extrabold text-ink">
              ${formatCents(cost.totalCents)}
            </span>
          </div>
          <div className="mt-1.5 flex items-baseline justify-between">
            <span className="text-xs text-muted">Sell price</span>
            <span className="font-display text-xl font-extrabold text-ink">
              ${formatCents(priceCents)}
            </span>
          </div>

          {margin && marginPct !== null ? (
            <div className="mt-4">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-label">
                  Margin
                </span>
                <span
                  className={cx(
                    "text-xs font-bold",
                    healthy ? "text-success-deep" : "text-warm-deep",
                  )}
                >
                  {marginPct}% · ${formatCents(margin.profitCents)}
                </span>
              </div>
              <div className="flex h-2.5 overflow-hidden rounded-pill bg-line">
                <span
                  className={cx(
                    "h-full",
                    healthy ? "bg-[var(--color-success)]" : "bg-warm",
                  )}
                  style={{ width: `${Math.max(0, Math.min(100, marginPct))}%` }}
                />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span
                  className={cx(
                    "rounded-[7px] px-2 py-0.5 text-[10px] font-bold",
                    healthy
                      ? "bg-[var(--color-success)]/12 text-success-deep"
                      : "bg-[var(--color-warm)]/12 text-warm-deep",
                  )}
                >
                  {healthy ? "Healthy" : "Below target"}
                </span>
                <span className="text-[11px] text-muted">
                  Target {Math.round(TARGET_MARGIN * 100)}%.
                </span>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-[11px] text-muted">
              Set a sell price to see this dish&apos;s margin.
            </p>
          )}

          {variants.length > 0 ? (
            <>
              <div className="my-3 h-px bg-line" />
              <p className="mb-2 font-mono text-[9px] font-bold uppercase tracking-wider text-label">
                By size
              </p>
              <ul className="space-y-1">
                {variants.map((variant) => {
                  const vMargin = marginOf(variant.priceCents, cost.totalCents);
                  return (
                    <li
                      key={variant.name}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="font-medium text-ink">
                        {variant.name} · ${formatCents(variant.priceCents)}
                      </span>
                      <span className="font-mono text-[10px] text-muted">
                        {vMargin ? `${Math.round(vMargin.fraction * 100)}%` : "—"}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-[10px] text-muted">
                Costed per serve; larger sizes may use more — adjust the recipe
                if they differ.
              </p>
            </>
          ) : null}
        </div>

        <div className="flex gap-2 rounded-[13px] bg-forest-deep px-3.5 py-3">
          <span aria-hidden="true" className="shrink-0 text-[13px] text-concierge-mint">
            ℹ
          </span>
          <p className="text-[11px] leading-relaxed text-concierge-sage">
            Costs come from your ingredient library — update a pack price once
            and every dish recomputes.
          </p>
        </div>
      </div>
    </div>
  );
}

function AddRecipeLine({
  itemId,
  options,
}: {
  itemId: string;
  options: IngredientOption[];
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-input border border-dashed border-line-strong px-3 py-2 text-center text-xs font-bold text-ink transition hover:bg-hover-secondary"
      >
        ＋ Add ingredient
      </button>
    );
  }

  return (
    <form
      action={addRecipeLine}
      className="flex flex-wrap items-center gap-2 rounded-input border border-line bg-surface-elevated px-2.5 py-2"
    >
      <input type="hidden" name="menuItemId" value={itemId} />
      <input
        name="qty"
        inputMode="decimal"
        required
        placeholder="Qty"
        aria-label="Quantity"
        className="w-16 rounded-md border border-line bg-surface-elevated px-2 py-1 text-center text-sm text-ink focus-visible:border-[var(--color-accent)] focus-visible:shadow-[var(--focus-ring-input)] focus-visible:outline-none"
      />
      <select
        name="ingredientId"
        required
        defaultValue=""
        aria-label="Ingredient"
        className="min-w-0 flex-1 rounded-md border border-line bg-surface-elevated px-2 py-1.5 text-sm text-ink focus-visible:border-[var(--color-accent)] focus-visible:shadow-[var(--focus-ring-input)] focus-visible:outline-none"
      >
        <option value="" disabled>
          Choose an ingredient…
        </option>
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.name} ({opt.unit})
          </option>
        ))}
      </select>
      <Button type="submit" variant="primary" size="sm">
        Add
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(false)}
      >
        Cancel
      </Button>
    </form>
  );
}
