import { describe, expect, it } from "vitest";

import {
  type CartLine,
  type GroupRow,
  type ItemRow,
  type MenuSnapshot,
  type OptionRow,
  planOrderLines,
  type VariantRow,
} from "@/lib/payments/line-plan";

/**
 * The checkout recompute is the point where a hostile cart tries to underpay.
 * These cases are the audit's F8 gap: every rule that stands between a forged
 * request and a mispriced order.
 */

// Flat-priced item with one optional-extras group (0..2) and one required
// choice group (exactly 1).
const BURGER: ItemRow = { id: "item-burger", name: "Burger", priceCents: 1200 };
// Variant-priced item (its own price_cents must be IGNORED).
const PIZZA: ItemRow = { id: "item-pizza", name: "Pizza", priceCents: 999_999 };

const PIZZA_SMALL: VariantRow = {
  id: "var-small",
  itemId: PIZZA.id,
  name: "Small",
  priceCents: 1600,
};
const PIZZA_LARGE: VariantRow = {
  id: "var-large",
  itemId: PIZZA.id,
  name: "Large",
  priceCents: 2400,
};

const EXTRAS: GroupRow = {
  id: "grp-extras",
  itemId: BURGER.id,
  minSelect: 0,
  maxSelect: 2,
};
const DONENESS: GroupRow = {
  id: "grp-doneness",
  itemId: BURGER.id,
  minSelect: 1,
  maxSelect: 1,
};
const PIZZA_TOPPINGS: GroupRow = {
  id: "grp-toppings",
  itemId: PIZZA.id,
  minSelect: 0,
  maxSelect: 3,
};

const BACON: OptionRow = {
  id: "opt-bacon",
  groupId: EXTRAS.id,
  name: "Bacon",
  priceDeltaCents: 300,
};
const CHEESE: OptionRow = {
  id: "opt-cheese",
  groupId: EXTRAS.id,
  name: "Cheese",
  priceDeltaCents: 150,
};
const MEDIUM: OptionRow = {
  id: "opt-medium",
  groupId: DONENESS.id,
  name: "Medium",
  priceDeltaCents: 0,
};
const OLIVES: OptionRow = {
  id: "opt-olives",
  groupId: PIZZA_TOPPINGS.id,
  name: "Olives",
  priceDeltaCents: 200,
};

function snapshot(overrides: Partial<MenuSnapshot> = {}): MenuSnapshot {
  const groups = [EXTRAS, DONENESS, PIZZA_TOPPINGS];
  const groupsByItem = new Map<string, GroupRow[]>();
  for (const group of groups) {
    groupsByItem.set(group.itemId, [
      ...(groupsByItem.get(group.itemId) ?? []),
      group,
    ]);
  }
  return {
    itemById: new Map([
      [BURGER.id, BURGER],
      [PIZZA.id, PIZZA],
    ]),
    variantById: new Map([
      [PIZZA_SMALL.id, PIZZA_SMALL],
      [PIZZA_LARGE.id, PIZZA_LARGE],
    ]),
    itemsWithVariants: new Set([PIZZA.id]),
    groupById: new Map(groups.map((g) => [g.id, g])),
    groupsByItem,
    optionById: new Map(
      [BACON, CHEESE, MEDIUM, OLIVES].map((o) => [o.id, o]),
    ),
    ...overrides,
  };
}

/** A valid burger line: satisfies the required doneness group. */
function burgerLine(overrides: Partial<CartLine> = {}): CartLine {
  return {
    itemId: BURGER.id,
    quantity: 1,
    selectedOptionIds: [MEDIUM.id],
    ...overrides,
  };
}

function expectRejected(result: ReturnType<typeof planOrderLines>): string {
  expect(result.ok).toBe(false);
  return result.ok ? "" : result.error;
}

describe("planOrderLines — pricing authority", () => {
  it("prices a flat line from the DB row and sums modifier deltas", () => {
    const result = planOrderLines(
      [burgerLine({ quantity: 3, selectedOptionIds: [MEDIUM.id, BACON.id] })],
      snapshot(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 1200 base + 0 (medium) + 300 (bacon) = 1500/unit × 3.
    expect(result.plan[0].unitCents).toBe(1500);
    expect(result.plan[0].lineTotalCents).toBe(4500);
    expect(result.subtotalCents).toBe(4500);
  });

  it("uses the VARIANT price and ignores the item's own price_cents", () => {
    const result = planOrderLines(
      [
        {
          itemId: PIZZA.id,
          variantId: PIZZA_LARGE.id,
          quantity: 2,
          selectedOptionIds: [],
        },
      ],
      snapshot(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 2400 (Large), NOT the item's decoy 999_999.
    expect(result.plan[0].unitCents).toBe(2400);
    expect(result.plan[0].lineTotalCents).toBe(4800);
    expect(result.plan[0].variant?.name).toBe("Large");
  });

  it("layers modifier deltas on top of the variant base", () => {
    const result = planOrderLines(
      [
        {
          itemId: PIZZA.id,
          variantId: PIZZA_SMALL.id,
          quantity: 1,
          selectedOptionIds: [OLIVES.id],
        },
      ],
      snapshot(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan[0].unitCents).toBe(1800); // 1600 + 200
  });

  it("sums a multi-line cart", () => {
    const result = planOrderLines(
      [
        burgerLine(),
        {
          itemId: PIZZA.id,
          variantId: PIZZA_SMALL.id,
          quantity: 1,
          selectedOptionIds: [],
        },
      ],
      snapshot(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.subtotalCents).toBe(1200 + 1600);
    expect(result.plan).toHaveLength(2);
  });

  it("snapshots the option name and delta for the order record", () => {
    const result = planOrderLines(
      [burgerLine({ selectedOptionIds: [MEDIUM.id, CHEESE.id] })],
      snapshot(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan[0].options).toEqual([
      { id: MEDIUM.id, name: "Medium", priceDeltaCents: 0 },
      { id: CHEESE.id, name: "Cheese", priceDeltaCents: 150 },
    ]);
  });

  it("plans an empty cart as a zero subtotal (bounds live in the schema)", () => {
    const result = planOrderLines([], snapshot());
    expect(result).toEqual({ ok: true, plan: [], subtotalCents: 0 });
  });
});

describe("planOrderLines — hostile input", () => {
  it("rejects an item that is not in the live, venue-scoped fetch", () => {
    // A cross-venue or unavailable item is structurally absent from the map.
    const error = expectRejected(
      planOrderLines([burgerLine({ itemId: "item-other-venue" })], snapshot()),
    );
    expect(error).toBe("An item in your cart is no longer available.");
  });

  it("rejects a variant-priced item with no size chosen", () => {
    const error = expectRejected(
      planOrderLines(
        [{ itemId: PIZZA.id, quantity: 1, selectedOptionIds: [] }],
        snapshot(),
      ),
    );
    expect(error).toBe("Please choose a size for an item in your cart.");
  });

  it("rejects a size that belongs to a DIFFERENT item", () => {
    // Cross-item variant injection: a real variant id, wrong parent item.
    const stray: VariantRow = {
      id: "var-stray",
      itemId: "item-elsewhere",
      name: "Cheap",
      priceCents: 1,
    };
    const snap = snapshot();
    snap.variantById.set(stray.id, stray);
    const error = expectRejected(
      planOrderLines(
        [
          {
            itemId: PIZZA.id,
            variantId: stray.id,
            quantity: 1,
            selectedOptionIds: [],
          },
        ],
        snap,
      ),
    );
    expect(error).toBe("A size in your cart is no longer available.");
  });

  it("rejects an unknown/forged variant id", () => {
    const error = expectRejected(
      planOrderLines(
        [
          {
            itemId: PIZZA.id,
            variantId: "var-forged",
            quantity: 1,
            selectedOptionIds: [],
          },
        ],
        snapshot(),
      ),
    );
    expect(error).toBe("A size in your cart is no longer available.");
  });

  it("rejects a variant on a flat-priced item", () => {
    const error = expectRejected(
      planOrderLines(
        [burgerLine({ variantId: PIZZA_SMALL.id })],
        snapshot(),
      ),
    );
    expect(error).toBe("Invalid selection.");
  });

  it("rejects duplicate option ids (min/max can't be gamed by repeats)", () => {
    const error = expectRejected(
      planOrderLines(
        [burgerLine({ selectedOptionIds: [MEDIUM.id, BACON.id, BACON.id] })],
        snapshot(),
      ),
    );
    expect(error).toBe("Invalid selection.");
  });

  it("rejects an unknown/forged option id", () => {
    const error = expectRejected(
      planOrderLines(
        [burgerLine({ selectedOptionIds: [MEDIUM.id, "opt-forged"] })],
        snapshot(),
      ),
    );
    expect(error).toBe("A selected option is no longer available.");
  });

  it("blocks CROSS-ITEM option injection (real option, wrong item)", () => {
    // OLIVES is a real, available option — but its group belongs to the pizza.
    // Attaching it to the burger line must be refused, not priced.
    const error = expectRejected(
      planOrderLines(
        [burgerLine({ selectedOptionIds: [MEDIUM.id, OLIVES.id] })],
        snapshot(),
      ),
    );
    expect(error).toBe("Invalid selection.");
  });

  it("blocks an option whose group is absent from the fetch (cross-venue)", () => {
    const orphan: OptionRow = {
      id: "opt-orphan",
      groupId: "grp-other-venue",
      name: "Orphan",
      priceDeltaCents: -5000,
    };
    const snap = snapshot();
    snap.optionById.set(orphan.id, orphan);
    const error = expectRejected(
      planOrderLines(
        [burgerLine({ selectedOptionIds: [MEDIUM.id, orphan.id] })],
        snap,
      ),
    );
    expect(error).toBe("Invalid selection.");
  });

  it("enforces a required group's minimum", () => {
    const error = expectRejected(
      planOrderLines([burgerLine({ selectedOptionIds: [] })], snapshot()),
    );
    expect(error).toBe("Please review the required options for an item.");
  });

  it("enforces a group's maximum", () => {
    const extra: OptionRow = {
      id: "opt-onions",
      groupId: EXTRAS.id,
      name: "Onions",
      priceDeltaCents: 100,
    };
    const snap = snapshot();
    snap.optionById.set(extra.id, extra);
    // EXTRAS allows at most 2; three distinct extras must be refused.
    const error = expectRejected(
      planOrderLines(
        [
          burgerLine({
            selectedOptionIds: [MEDIUM.id, BACON.id, CHEESE.id, extra.id],
          }),
        ],
        snap,
      ),
    );
    expect(error).toBe("Please review the required options for an item.");
  });

  it("rejects the whole cart when any later line is invalid", () => {
    const result = planOrderLines(
      [burgerLine(), burgerLine({ itemId: "item-gone" })],
      snapshot(),
    );
    expect(result.ok).toBe(false);
  });
});
