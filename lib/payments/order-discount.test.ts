import { describe, expect, it } from "vitest";

import { MIN_TOTAL_CENTS } from "./bank-discount";
import { composeOrderDiscount, promoDiscountRawCents } from "./order-discount";

describe("promoDiscountRawCents", () => {
  it("computes a percentage discount, half-up rounded", () => {
    expect(promoDiscountRawCents(2200, "percent", 25)).toBe(550); // 25% of $22
    expect(promoDiscountRawCents(1234, "percent", 10)).toBe(123); // 123.4 → 123
    expect(promoDiscountRawCents(1235, "percent", 10)).toBe(124); // 123.5 → 124
  });

  it("passes an amount discount through as cents", () => {
    expect(promoDiscountRawCents(2200, "amount", 500)).toBe(500);
  });

  it("guards against non-positive inputs", () => {
    expect(promoDiscountRawCents(0, "percent", 25)).toBe(0);
    expect(promoDiscountRawCents(2200, "amount", 0)).toBe(0);
  });
});

describe("composeOrderDiscount", () => {
  it("applies the promo first, then bank fills the remaining room", () => {
    const r = composeOrderDiscount({
      subtotalCents: 2200,
      promoRaw: 500,
      bankRaw: 300,
    });
    expect(r.promoDiscountCents).toBe(500);
    expect(r.discountCents).toBe(800);
    expect(r.totalCents).toBe(1400);
  });

  it("clamps the combined discount so the total never drops below the minimum", () => {
    // maxDiscount = 2200 - 50 = 2150; promo 2000 leaves 150 for bank.
    const r = composeOrderDiscount({
      subtotalCents: 2200,
      promoRaw: 2000,
      bankRaw: 1000,
    });
    expect(r.promoDiscountCents).toBe(2000);
    expect(r.discountCents).toBe(2200 - MIN_TOTAL_CENTS);
    expect(r.totalCents).toBe(MIN_TOTAL_CENTS);
  });

  it("clamps the promo itself to the max discount", () => {
    const r = composeOrderDiscount({
      subtotalCents: 2200,
      promoRaw: 999999,
      bankRaw: 500,
    });
    expect(r.promoDiscountCents).toBe(2200 - MIN_TOTAL_CENTS);
    expect(r.discountCents).toBe(2200 - MIN_TOTAL_CENTS);
    expect(r.totalCents).toBe(MIN_TOTAL_CENTS);
  });

  it("never produces a negative discount or total", () => {
    const r = composeOrderDiscount({
      subtotalCents: 2200,
      promoRaw: -100,
      bankRaw: -50,
    });
    expect(r.discountCents).toBe(0);
    expect(r.totalCents).toBe(2200);
  });
});
