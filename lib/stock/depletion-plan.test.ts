import { describe, expect, it } from "vitest";

import { planDepletion, sumQuantityByMenuItem } from "./depletion-plan";

/**
 * Stock depletion arithmetic. Previously reachable only through two DB
 * round-trips and a transaction, so none of it was covered.
 *
 * Both summations under-deplete SILENTLY when wrong: stock stays higher than
 * reality, no reorder signal fires, and nobody notices until someone counts the
 * shelf. That is the failure mode these tests exist for.
 */
describe("sumQuantityByMenuItem", () => {
  it("adds up several lines that share one menu item", () => {
    // Different variants / modifier sets are SEPARATE order lines pointing at
    // the same item. A per-line loop would keep only the last.
    const qty = sumQuantityByMenuItem([
      { menuItemId: "pizza", quantity: 2 },
      { menuItemId: "pizza", quantity: 3 },
      { menuItemId: "salad", quantity: 1 },
    ]);
    expect(qty.get("pizza")).toBe(5);
    expect(qty.get("salad")).toBe(1);
  });

  it("skips lines whose menu item was deleted", () => {
    // menuItemId is a soft ref; a since-deleted item has no recipe to map.
    const qty = sumQuantityByMenuItem([
      { menuItemId: null, quantity: 9 },
      { menuItemId: "pizza", quantity: 2 },
    ]);
    expect(qty.has("pizza")).toBe(true);
    expect(qty.size).toBe(1);
  });

  it("is empty for an order of only deleted items", () => {
    expect(sumQuantityByMenuItem([{ menuItemId: null, quantity: 4 }]).size).toBe(
      0,
    );
  });
});

describe("planDepletion", () => {
  it("multiplies servings by the recipe quantity", () => {
    const plan = planDepletion(
      [{ menuItemId: "pizza", quantity: 3 }],
      [{ menuItemId: "pizza", ingredientId: "flour", qty: 250 }],
    );
    expect(plan.get("flour")).toBe(750);
  });

  it("accumulates an ingredient shared by two different dishes", () => {
    // Both dishes use cheese. Overwriting instead of accumulating would deplete
    // only one dish's worth — the subtler of the two bugs, because the total is
    // plausible rather than zero.
    const plan = planDepletion(
      [
        { menuItemId: "pizza", quantity: 2 },
        { menuItemId: "lasagne", quantity: 1 },
      ],
      [
        { menuItemId: "pizza", ingredientId: "cheese", qty: 100 },
        { menuItemId: "lasagne", ingredientId: "cheese", qty: 150 },
      ],
    );
    expect(plan.get("cheese")).toBe(2 * 100 + 150);
  });

  it("combines both summations end to end", () => {
    // Two lines of the same dish AND a shared ingredient at once.
    const plan = planDepletion(
      [
        { menuItemId: "pizza", quantity: 2 },
        { menuItemId: "pizza", quantity: 1 },
        { menuItemId: "salad", quantity: 4 },
      ],
      [
        { menuItemId: "pizza", ingredientId: "cheese", qty: 100 },
        { menuItemId: "pizza", ingredientId: "flour", qty: 250 },
        { menuItemId: "salad", ingredientId: "cheese", qty: 20 },
      ],
    );
    expect(plan.get("cheese")).toBe(3 * 100 + 4 * 20);
    expect(plan.get("flour")).toBe(3 * 250);
  });

  it("ignores recipes for items nobody ordered", () => {
    const plan = planDepletion(
      [{ menuItemId: "pizza", quantity: 1 }],
      [
        { menuItemId: "pizza", ingredientId: "flour", qty: 250 },
        { menuItemId: "lasagne", ingredientId: "beef", qty: 300 },
      ],
    );
    expect(plan.has("beef")).toBe(false);
    expect(plan.size).toBe(1);
  });

  it("never credits stock back from a non-positive recipe quantity", () => {
    // A zero or negative recipe qty must be skipped, not turned into a positive
    // deltaQty by the caller's `-consumed` negation.
    const plan = planDepletion(
      [{ menuItemId: "pizza", quantity: 2 }],
      [
        { menuItemId: "pizza", ingredientId: "flour", qty: 0 },
        { menuItemId: "pizza", ingredientId: "salt", qty: -5 },
      ],
    );
    expect(plan.size).toBe(0);
  });

  it("is empty when the order maps to no recipes at all", () => {
    expect(
      planDepletion([{ menuItemId: "pizza", quantity: 1 }], []).size,
    ).toBe(0);
  });

  it("is empty when every ordered item was deleted", () => {
    // Short-circuits before touching recipes.
    expect(
      planDepletion(
        [{ menuItemId: null, quantity: 3 }],
        [{ menuItemId: "pizza", ingredientId: "flour", qty: 250 }],
      ).size,
    ).toBe(0);
  });
});
