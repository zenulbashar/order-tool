import { describe, expect, it } from "vitest";

import {
  costPerUnitCents,
  dishCost,
  formatUnitCost,
  isCosted,
  isLowStock,
  marginOf,
  recipeLineCostCents,
} from "./cost";

describe("costPerUnitCents", () => {
  it("divides pack cost by pack size, adjusted for yield", () => {
    // $28.80 pack / 12000 ml @ 100% yield → 0.24 c/ml.
    expect(
      costPerUnitCents({ packSize: 12000, packCostCents: 2880, yieldPct: 100 }),
    ).toBeCloseTo(0.24, 6);
    // 80% yield raises the effective cost.
    expect(
      costPerUnitCents({ packSize: 12000, packCostCents: 2880, yieldPct: 80 }),
    ).toBeCloseTo(0.3, 6);
  });

  it("returns null when uncosted or the inputs are invalid", () => {
    expect(
      costPerUnitCents({ packSize: null, packCostCents: 2880, yieldPct: 100 }),
    ).toBeNull();
    expect(
      costPerUnitCents({ packSize: 12000, packCostCents: null, yieldPct: 100 }),
    ).toBeNull();
    expect(
      costPerUnitCents({ packSize: 0, packCostCents: 2880, yieldPct: 100 }),
    ).toBeNull();
    expect(
      costPerUnitCents({ packSize: 12000, packCostCents: 2880, yieldPct: 0 }),
    ).toBeNull();
  });
});

describe("isCosted / isLowStock", () => {
  it("isCosted needs both pack size and pack cost", () => {
    expect(isCosted({ packSize: 1000, packCostCents: 500 })).toBe(true);
    expect(isCosted({ packSize: null, packCostCents: 500 })).toBe(false);
    expect(isCosted({ packSize: 1000, packCostCents: null })).toBe(false);
  });

  it("isLowStock only when both on-hand and par are set and below par", () => {
    expect(isLowStock({ onHandQty: 2, parLevel: 5 })).toBe(true);
    expect(isLowStock({ onHandQty: 5, parLevel: 5 })).toBe(false); // equal is not low
    expect(isLowStock({ onHandQty: 2, parLevel: null })).toBe(false);
    expect(isLowStock({ onHandQty: null, parLevel: 5 })).toBe(false);
  });
});

describe("formatUnitCost", () => {
  it("scales precision with magnitude", () => {
    expect(formatUnitCost(0.24)).toBe("$0.0024"); // < 10c → 4dp
    expect(formatUnitCost(18.5)).toBe("$0.185"); // < $1 → 3dp
    expect(formatUnitCost(174)).toBe("$1.74"); // ≥ $1 → 2dp
  });
});

describe("recipeLineCostCents / dishCost / marginOf", () => {
  const costed = { packSize: 12000, packCostCents: 2880, yieldPct: 100 };
  const uncosted = { packSize: null, packCostCents: null, yieldPct: 100 };

  it("costs one line as qty × per-unit, null when uncosted", () => {
    expect(recipeLineCostCents({ ingredient: costed, qty: 100 })).toBeCloseTo(24, 6);
    expect(recipeLineCostCents({ ingredient: uncosted, qty: 100 })).toBeNull();
  });

  it("aggregates a dish, counting (not guessing) uncosted lines", () => {
    const result = dishCost([
      { ingredient: costed, qty: 100 },
      { ingredient: uncosted, qty: 50 },
    ]);
    expect(result).toEqual({ totalCents: 24, uncostedLines: 1, lineCount: 2 });
  });

  it("computes margin fraction + profit, null when price is non-positive", () => {
    expect(marginOf(1000, 400)).toEqual({ fraction: 0.6, profitCents: 600 });
    expect(marginOf(400, 1000)).toEqual({ fraction: -1.5, profitCents: -600 });
    expect(marginOf(0, 100)).toBeNull();
  });
});
