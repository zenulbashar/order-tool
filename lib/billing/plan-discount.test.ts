import { describe, expect, it } from "vitest";

import { planDiscountCouponParams } from "./plan-discount";

describe("planDiscountCouponParams", () => {
  it("builds a forever percent coupon", () => {
    expect(planDiscountCouponParams("percent", 15)).toEqual({
      percent_off: 15,
      duration: "forever",
    });
  });

  it("builds a forever AUD amount coupon in cents", () => {
    expect(planDiscountCouponParams("amount", 2500)).toEqual({
      amount_off: 2500,
      currency: "aud",
      duration: "forever",
    });
  });

  it("returns null for off or an out-of-range value, so nothing is created", () => {
    expect(planDiscountCouponParams("off", 0)).toBeNull();
    expect(planDiscountCouponParams("percent", 0)).toBeNull();
    expect(planDiscountCouponParams("percent", 101)).toBeNull();
    expect(planDiscountCouponParams("amount", -100)).toBeNull();
  });
});
