import { describe, expect, it } from "vitest";

import { inclusiveTaxCents } from "./tax";

describe("inclusiveTaxCents", () => {
  it("returns 0 when the rate or amount is non-positive", () => {
    expect(inclusiveTaxCents(2200, 0)).toBe(0);
    expect(inclusiveTaxCents(0, 1000)).toBe(0);
    expect(inclusiveTaxCents(-100, 1000)).toBe(0);
  });

  it("extracts the GST component contained in a 10% inclusive total", () => {
    // $22.00 incl. 10% GST → $2.00.
    expect(inclusiveTaxCents(2200, 1000)).toBe(200);
  });

  it("re-derives correctly off a discounted total (the fixed BAS bug)", () => {
    // After an $11 discount the charged total is $11.00; GST is $1.00, not $2.00.
    expect(inclusiveTaxCents(1100, 1000)).toBe(100);
  });

  it("half-up rounds to the cent", () => {
    // 1000 bps of 1055 → 1055*1000/11000 = 95.909… → 96.
    expect(inclusiveTaxCents(1055, 1000)).toBe(96);
  });
});
