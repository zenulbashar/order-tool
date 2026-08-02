/**
 * The arithmetic behind order-driven stock depletion, extracted from
 * `applyDepletionForOrder` so it can be tested without a database — the same
 * move `lib/payments/line-plan.ts` made for the checkout recompute, and for the
 * same reason: this decides how much stock leaves the building, and it was
 * reachable only through two DB round-trips and a transaction.
 *
 * Lifted VERBATIM. Same accumulation order, same skip conditions, same
 * `<= 0` guard. If this and `applyDepletionForOrder` ever disagree, this file is
 * wrong, not the caller.
 *
 * Two summations, and both matter:
 *
 *  1. Quantity per MENU ITEM. Several order lines can point at the same item
 *     (different variants or modifier sets are separate lines), so a naive
 *     per-line loop would deplete only the last one's worth.
 *  2. Consumption per INGREDIENT. Several menu items on one order can share an
 *     ingredient, and a recipe lists one row per ingredient — so the totals have
 *     to accumulate across items rather than overwrite.
 *
 * Getting either wrong under-depletes silently: stock stays high, the owner
 * never sees a reorder signal, and the error is invisible until someone counts
 * the shelf.
 */

export type DepletionLine = {
  /** Null when the menu item has since been deleted — no recipe to map. */
  menuItemId: string | null;
  quantity: number;
};

export type DepletionRecipeLine = {
  menuItemId: string;
  ingredientId: string;
  /** Amount of the ingredient consumed by ONE serving of the item. */
  qty: number;
};

/** Total ordered quantity per menu item, skipping lines with no item. */
export function sumQuantityByMenuItem(
  lines: readonly DepletionLine[],
): Map<string, number> {
  const qtyByMenuItem = new Map<string, number>();
  for (const line of lines) {
    if (!line.menuItemId) continue;
    qtyByMenuItem.set(
      line.menuItemId,
      (qtyByMenuItem.get(line.menuItemId) ?? 0) + line.quantity,
    );
  }
  return qtyByMenuItem;
}

/**
 * Total consumption per ingredient across every ordered serving.
 *
 * A recipe row for a menu item nobody ordered contributes 0 servings and is
 * skipped by the `amount <= 0` guard, which also drops non-positive recipe
 * quantities rather than crediting stock back.
 *
 * Takes the already-summed quantities because `applyDepletionForOrder` needs
 * that map anyway — it is what scopes the recipe query — so recomputing it here
 * would be wasted work.
 */
export function consumptionByIngredient(
  qtyByMenuItem: ReadonlyMap<string, number>,
  recipes: readonly DepletionRecipeLine[],
): Map<string, number> {
  const consumedByIngredient = new Map<string, number>();
  if (qtyByMenuItem.size === 0) return consumedByIngredient;

  for (const recipe of recipes) {
    const servings = qtyByMenuItem.get(recipe.menuItemId) ?? 0;
    const amount = servings * recipe.qty;
    if (amount <= 0) continue;
    consumedByIngredient.set(
      recipe.ingredientId,
      (consumedByIngredient.get(recipe.ingredientId) ?? 0) + amount,
    );
  }
  return consumedByIngredient;
}

/** Both summations, end to end — the whole plan from raw order lines. */
export function planDepletion(
  lines: readonly DepletionLine[],
  recipes: readonly DepletionRecipeLine[],
): Map<string, number> {
  return consumptionByIngredient(sumQuantityByMenuItem(lines), recipes);
}
