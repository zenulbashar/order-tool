import type { Ingredient } from "@/lib/db/schema";

/**
 * Ingredient cost-per-recipe-unit — the ONE derivation everything downstream
 * (recipe COGS in D2, margins) reads. Never stored: pack cost ÷ pack size,
 * adjusted for yield. Returns fractional CENTS per unit (e.g. oat milk
 * $28.80 / 12000 ml = 0.24 c/ml), or null when the ingredient is uncosted
 * (no pack size or no pack cost yet).
 */
export function costPerUnitCents(
  ingredient: Pick<Ingredient, "packSize" | "packCostCents" | "yieldPct">,
): number | null {
  const { packSize, packCostCents, yieldPct } = ingredient;
  if (packSize == null || packCostCents == null || packSize <= 0) return null;
  const usableFraction = yieldPct / 100;
  if (usableFraction <= 0) return null;
  return packCostCents / packSize / usableFraction;
}

/** Whether an ingredient has enough data to compute a cost. */
export function isCosted(
  ingredient: Pick<Ingredient, "packSize" | "packCostCents">,
): boolean {
  return ingredient.packSize != null && ingredient.packCostCents != null;
}

/**
 * Format a fractional-cents-per-unit value as a dollar string with sensible
 * precision — matching the design ($0.0024, $0.185, $1.74): 4 dp below 10c,
 * 3 dp below $1, else 2 dp.
 */
export function formatUnitCost(cents: number): string {
  const dollars = cents / 100;
  const decimals = dollars < 0.1 ? 4 : dollars < 1 ? 3 : 2;
  return `$${dollars.toFixed(decimals)}`;
}

/* -------------------------------------------------------------------------- */
/* Recipe / dish costing (D2) — all derived from ingredient costs above.       */
/* -------------------------------------------------------------------------- */

export type RecipeLineCost = {
  ingredient: Pick<
    Ingredient,
    "packSize" | "packCostCents" | "yieldPct"
  >;
  qty: number;
};

/** Cost of one recipe line = qty × cost-per-unit, or null when uncosted. */
export function recipeLineCostCents(line: RecipeLineCost): number | null {
  const perUnit = costPerUnitCents(line.ingredient);
  return perUnit === null ? null : perUnit * line.qty;
}

export type DishCost = {
  /** Sum of the COSTED lines' cost, in cents (rounded). */
  totalCents: number;
  /** How many lines couldn't be costed (ingredient has no pack data yet). */
  uncostedLines: number;
  lineCount: number;
};

/** Aggregate a dish's cost from its recipe lines. Uncosted lines are counted, not guessed. */
export function dishCost(lines: RecipeLineCost[]): DishCost {
  let totalCents = 0;
  let uncostedLines = 0;
  for (const line of lines) {
    const cost = recipeLineCostCents(line);
    if (cost === null) uncostedLines += 1;
    else totalCents += cost;
  }
  return { totalCents: Math.round(totalCents), uncostedLines, lineCount: lines.length };
}

/**
 * Margin of a sell price over a dish cost. Returns the margin fraction (0–1)
 * and the absolute profit in cents. Null price/zero → null (can't divide).
 */
export function marginOf(
  priceCents: number,
  costCents: number,
): { fraction: number; profitCents: number } | null {
  if (priceCents <= 0) return null;
  const profitCents = priceCents - costCents;
  return { fraction: profitCents / priceCents, profitCents };
}
