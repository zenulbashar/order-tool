import { describe, expect, it } from "vitest";

import {
  dietaryTagLabel,
  dollarsToCents,
  formatCents,
  normalizeDietaryTags,
  normalizeEmail,
  orderReference,
  priceDollarsToCentsSchema,
  slugSchema,
  slugify,
} from "./validation";

describe("normalizeEmail", () => {
  it("trims and lower-cases a valid address", () => {
    expect(normalizeEmail("  Foo@Bar.COM ")).toBe("foo@bar.com");
  });

  it("throws on anything that isn't a single well-formed address", () => {
    expect(() => normalizeEmail("nope")).toThrow();
    expect(() => normalizeEmail("a@b@c")).toThrow();
    expect(() => normalizeEmail("@x.com")).toThrow();
    expect(() => normalizeEmail("x@")).toThrow();
  });
});

describe("slugify", () => {
  it("strips accents and collapses non-alphanumerics to single hyphens", () => {
    expect(slugify("Café Déli!!")).toBe("cafe-deli");
    expect(slugify("  My  Great   Venue  ")).toBe("my-great-venue");
  });

  it("returns empty for an all-symbol name (kept editable upstream)", () => {
    expect(slugify("!!!")).toBe("");
  });
});

describe("formatCents", () => {
  it("renders integer cents as a two-decimal dollar string", () => {
    expect(formatCents(1250)).toBe("12.50");
    expect(formatCents(5)).toBe("0.05");
    expect(formatCents(0)).toBe("0.00");
  });
});

describe("dollarsToCents", () => {
  it("parses a dollars string to integer cents (float-safe)", () => {
    expect(dollarsToCents("12.99")).toBe(1299);
    expect(dollarsToCents("12.5")).toBe(1250);
    expect(dollarsToCents("  5 ")).toBe(500);
  });

  it("returns null for blank or malformed input", () => {
    expect(dollarsToCents("")).toBeNull();
    expect(dollarsToCents("abc")).toBeNull();
    expect(dollarsToCents("12.999")).toBeNull(); // > 2 decimals
  });
});

describe("dietary tags", () => {
  it("labels a known tag, echoes an unknown one", () => {
    expect(dietaryTagLabel("gluten_friendly")).toBe("Gluten friendly");
    expect(dietaryTagLabel("halal")).toBe("Halal");
  });

  it("de-duplicates, drops off-vocab values, and canonically orders", () => {
    expect(
      normalizeDietaryTags(["spicy", "vegan", "spicy", "bogus", "halal"]),
    ).toEqual(["vegan", "halal", "spicy"]);
  });
});

describe("orderReference", () => {
  it("is the first 8 token chars, upper-cased", () => {
    expect(orderReference("abcd1234efgh5678")).toBe("ABCD1234");
  });
});

describe("schemas", () => {
  it("slugSchema accepts a valid slug and lower-cases it", () => {
    expect(slugSchema.safeParse("My-Cafe").success && slugSchema.parse("My-Cafe")).toBe(
      "my-cafe",
    );
  });

  it("slugSchema rejects too-short, spaced, or double-hyphen slugs", () => {
    expect(slugSchema.safeParse("ab").success).toBe(false);
    expect(slugSchema.safeParse("my cafe").success).toBe(false);
    expect(slugSchema.safeParse("a--b").success).toBe(false);
  });

  it("priceDollarsToCentsSchema transforms dollars to integer cents", () => {
    const ok = priceDollarsToCentsSchema.safeParse("12.50");
    expect(ok.success && ok.data).toBe(1250);
    expect(priceDollarsToCentsSchema.safeParse("12.999").success).toBe(false);
    expect(priceDollarsToCentsSchema.safeParse("abc").success).toBe(false);
  });
});
