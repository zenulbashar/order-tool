import { describe, expect, it } from "vitest";

import {
  BANK_DISCOUNT_METADATA_KEY,
  bankDiscountCentsFromIntent,
} from "./bank-discount-settlement";

describe("bankDiscountCentsFromIntent", () => {
  it("reads the saving applyOrderDiscounts stamped on the intent", () => {
    expect(
      bankDiscountCentsFromIntent({ metadata: { [BANK_DISCOUNT_METADATA_KEY]: "150" } }),
    ).toBe(150);
  });

  it("treats a missing, zero or malformed stamp as no saving", () => {
    expect(bankDiscountCentsFromIntent({ metadata: {} })).toBe(0);
    expect(bankDiscountCentsFromIntent({ metadata: { [BANK_DISCOUNT_METADATA_KEY]: "0" } })).toBe(0);
    expect(bankDiscountCentsFromIntent({ metadata: { [BANK_DISCOUNT_METADATA_KEY]: "abc" } })).toBe(0);
    expect(bankDiscountCentsFromIntent({ metadata: { [BANK_DISCOUNT_METADATA_KEY]: "-5" } })).toBe(0);
  });
});
