import { describe, expect, it } from "vitest";

import type { PublicMenu } from "@/app/[slug]/types";

import { validateOrderRequest } from "./order-request";

/**
 * start_order validates against the live menu with the cart's own rules, so an
 * agent is told exactly what to fix and a diner never lands on a checkout that
 * rejects the basket. Prices come from the menu only.
 */
const menu: PublicMenu = [
  {
    id: "cat_1",
    name: "Bao",
    description: null,
    items: [
      {
        id: "itm_pork",
        name: "Pork belly bao",
        description: null,
        priceCents: 950,
        imageUrl: null,
        variants: [],
        tags: [],
        groups: [
          {
            id: "grp_spice",
            name: "Spice",
            minSelect: 1,
            maxSelect: 1,
            options: [
              { id: "opt_mild", name: "Mild", priceDeltaCents: 0 },
              { id: "opt_hot", name: "Hot", priceDeltaCents: 0 },
            ],
          },
          {
            id: "grp_extra",
            name: "Extras",
            minSelect: 0,
            maxSelect: 2,
            options: [{ id: "opt_egg", name: "Egg", priceDeltaCents: 150 }],
          },
        ],
      },
      {
        id: "itm_tea",
        name: "Iced tea",
        description: null,
        priceCents: 0,
        imageUrl: null,
        variants: [
          { id: "var_s", name: "Small", priceCents: 400 },
          { id: "var_l", name: "Large", priceCents: 550 },
        ],
        tags: [],
        groups: [],
      },
    ],
  },
];

describe("validateOrderRequest", () => {
  it("resolves names and prices from the menu and sums the subtotal", () => {
    const result = validateOrderRequest(menu, [
      { itemId: "itm_pork", optionIds: ["opt_hot", "opt_egg"], quantity: 2 },
      { itemId: "itm_tea", variantId: "var_l" },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lines[0]).toMatchObject({
      name: "Pork belly bao",
      optionNames: ["Hot", "Egg"],
      unitCents: 1100,
      lineCents: 2200,
      quantity: 2,
    });
    expect(result.lines[1]).toMatchObject({ variantName: "Large", unitCents: 550, quantity: 1 });
    expect(result.subtotalCents).toBe(2750);
  });

  it("requires a size on a variant-priced item and refuses a size on a flat one", () => {
    expect(validateOrderRequest(menu, [{ itemId: "itm_tea" }])).toMatchObject({
      ok: false,
      error: expect.stringContaining("needs a size"),
    });
    expect(
      validateOrderRequest(menu, [{ itemId: "itm_pork", variantId: "var_s", optionIds: ["opt_mild"] }]),
    ).toMatchObject({ ok: false, error: expect.stringContaining("has no sizes") });
  });

  it("enforces required and maximum modifier choices, and unknown option ids", () => {
    expect(validateOrderRequest(menu, [{ itemId: "itm_pork" }])).toMatchObject({
      ok: false,
      error: expect.stringContaining('choose at least 1 from "Spice"'),
    });
    expect(
      validateOrderRequest(menu, [{ itemId: "itm_pork", optionIds: ["opt_mild", "opt_hot"] }]),
    ).toMatchObject({ ok: false, error: expect.stringContaining("at most 1") });
    expect(
      validateOrderRequest(menu, [{ itemId: "itm_pork", optionIds: ["opt_mild", "opt_nope"] }]),
    ).toMatchObject({ ok: false, error: expect.stringContaining("unknown option") });
  });

  it("rejects unknown items, bad quantities and empty baskets", () => {
    expect(validateOrderRequest(menu, [{ itemId: "itm_ghost" }]).ok).toBe(false);
    expect(
      validateOrderRequest(menu, [{ itemId: "itm_pork", optionIds: ["opt_mild"], quantity: 0 }]).ok,
    ).toBe(false);
    expect(
      validateOrderRequest(menu, [{ itemId: "itm_pork", optionIds: ["opt_mild"], quantity: 51 }]).ok,
    ).toBe(false);
    expect(validateOrderRequest(menu, []).ok).toBe(false);
  });
});
