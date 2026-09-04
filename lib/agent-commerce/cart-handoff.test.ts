import { describe, expect, it } from "vitest";

import {
  decodeCartHandoff,
  encodeCartHandoff,
  HANDOFF_MAX_LINES,
} from "./cart-handoff";
import { MAX_LINE_QUANTITY } from "@/lib/orders/limits";

/**
 * The handoff token is the ONLY thing an external agent can put in a diner's
 * cart. It must round-trip ids and quantities, never carry a price, and shrug
 * off garbage.
 */
describe("cart handoff token", () => {
  const lines = [
    { itemId: "itm_1", variantId: "var_L", selectedOptionIds: ["opt_a", "opt_b"], quantity: 2 },
    { itemId: "itm_2", variantId: null, selectedOptionIds: [], quantity: 1 },
  ];

  it("round-trips lines and is URL-safe", () => {
    const token = encodeCartHandoff(lines);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCartHandoff(token)).toEqual(lines);
  });

  it("carries no price field even if one is smuggled into the JSON", () => {
    const smuggled = btoa(JSON.stringify([{ i: "itm_1", q: 1, unitCents: 1 }]));
    expect(decodeCartHandoff(smuggled)).toEqual([
      { itemId: "itm_1", variantId: null, selectedOptionIds: [], quantity: 1 },
    ]);
  });

  it("clamps quantities to the shared cap and defaults bad ones to 1", () => {
    const token = btoa(JSON.stringify([{ i: "itm_1", q: 999 }, { i: "itm_2", q: -3 }]));
    const decoded = decodeCartHandoff(token)!;
    expect(decoded[0].quantity).toBe(MAX_LINE_QUANTITY);
    expect(decoded[1].quantity).toBe(1);
  });

  it("drops malformed entries and rejects non-array or oversized tokens", () => {
    expect(decodeCartHandoff(btoa(JSON.stringify([null, 5, { i: "bad id!" }, { i: "ok_1" }])))).toEqual([
      { itemId: "ok_1", variantId: null, selectedOptionIds: [], quantity: 1 },
    ]);
    expect(decodeCartHandoff(btoa(JSON.stringify({ i: "x" })))).toBeNull();
    expect(decodeCartHandoff("not base64!!")).toBeNull();
    expect(decodeCartHandoff("")).toBeNull();
    expect(decodeCartHandoff("a".repeat(9000))).toBeNull();
  });

  it("caps the number of lines", () => {
    const many = Array.from({ length: HANDOFF_MAX_LINES + 5 }, (_, i) => ({
      itemId: `itm_${i}`,
      variantId: null,
      selectedOptionIds: [],
      quantity: 1,
    }));
    expect(decodeCartHandoff(encodeCartHandoff(many))!.length).toBe(HANDOFF_MAX_LINES);
  });
});
