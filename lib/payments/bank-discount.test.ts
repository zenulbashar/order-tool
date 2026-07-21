import { describe, expect, it } from "vitest";

import { MIN_TOTAL_CENTS, bankDiscountCents } from "./bank-discount";

describe("bankDiscountCents", () => {
  it("returns 0 when the mode is off", () => {
    expect(bankDiscountCents(2000, "off", 10)).toBe(0);
  });

  it("returns 0 for a non-positive value or subtotal", () => {
    expect(bankDiscountCents(2000, "flat", 0)).toBe(0);
    expect(bankDiscountCents(0, "percent", 10)).toBe(0);
    expect(bankDiscountCents(-100, "flat", 100)).toBe(0);
  });

  it("applies a flat saving in cents", () => {
    expect(bankDiscountCents(2000, "flat", 150)).toBe(150);
  });

  it("applies a percentage saving, half-up rounded", () => {
    expect(bankDiscountCents(2000, "percent", 3)).toBe(60); // 3% of $20.00
    expect(bankDiscountCents(2005, "percent", 3)).toBe(60); // 60.15 → 60
    expect(bankDiscountCents(1234, "percent", 7)).toBe(86); // 86.38 → 86
  });

  it("never drops the payable total below Stripe's minimum", () => {
    // subtotal $1.00, MIN 50c → max discount 50c; a $2.00 flat clamps to 50c.
    expect(bankDiscountCents(100, "flat", 200)).toBe(100 - MIN_TOTAL_CENTS);
  });

  it("never returns a negative saving", () => {
    // subtotal below the minimum → no room, so 0 (not negative).
    expect(bankDiscountCents(40, "flat", 100)).toBe(0);
  });
});
