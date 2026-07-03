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
