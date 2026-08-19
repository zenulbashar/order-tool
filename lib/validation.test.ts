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

/**
 * The sign-in path's real threat model.
 *
 * This function is the Resend provider's `normalizeIdentifier`, which REPLACES
 * Auth.js's own normalizer — so @auth/core's fix for GHSA-7rqj-j65f-68wh never
 * runs for us and the equivalent hardening has to live here. Its return value
 * becomes the `to:` of a magic link, so every case below is really asking one
 * question: can a caller make the address we validate differ from the address
 * the mailer delivers to?
 */
describe("normalizeEmail — address-splitting defences", () => {
  const FULLWIDTH_AT = "\uFF20"; // U+FF20 FULLWIDTH COMMERCIAL AT

  it("rejects a homoglyph @ that would canonicalize into a second recipient", () => {
    // The exact GHSA-7rqj-j65f-68wh shape. It carries ONE ascii "@", so a
    // validate-then-normalize function accepts it; NFKC then turns it into
    // "attacker@evil.com@victim.com" inside a downstream address parser, which
    // is how a link for victim.com gets delivered to evil.com.
    expect(() =>
      normalizeEmail(`attacker@evil.com${FULLWIDTH_AT}victim.com`),
    ).toThrow();
  });

  it("rejects a leading homoglyph @ for the same reason", () => {
    expect(() => normalizeEmail(`${FULLWIDTH_AT}attacker@evil.com`)).toThrow();
  });

  it("normalizes BEFORE validating, not after", () => {
    // The ordering IS the fix, so it is asserted directly: a fullwidth "@" as
    // the ONLY separator has to normalize to a real "@" and be accepted as one
    // address. A function that validated first would reject this as having no
    // "@" at all — passing the two tests above for the wrong reason, and still
    // accepting the dangerous inputs they cover.
    expect(normalizeEmail(`owner${FULLWIDTH_AT}venue.com`)).toBe(
      "owner@venue.com",
    );
  });

  it("rejects a quoted local part, which parsers disagree about", () => {
    expect(() => normalizeEmail('"attacker at evil.com"@victim.com')).toThrow();
  });

  it("rejects interior whitespace", () => {
    expect(() => normalizeEmail("attacker evil@victim.com")).toThrow();
  });

  it("rejects a newline, the classic header-injection separator", () => {
    expect(() =>
      normalizeEmail("victim@example.com\nbcc: attacker@evil.com"),
    ).toThrow();
  });

  it("rejects a NUL and other C0 controls that a trim() leaves behind", () => {
    expect(() => normalizeEmail("victim\u0000@example.com")).toThrow();
  });

  it("strips a non-breaking space rather than rejecting the address", () => {
    // NFKC folds U+00A0 to a plain space, so trim() can remove it. A pasted
    // address with a stray NBSP is a real thing owners do, and it is not an
    // attack — it should sign in, not error.
    expect(normalizeEmail("\u00a0owner@venue.com\u00a0")).toBe(
      "owner@venue.com",
    );
  });

  it("rejects an address past the RFC 5321 length ceiling", () => {
    expect(() => normalizeEmail(`${"a".repeat(250)}@venue.com`)).toThrow();
  });

  it("still accepts the ordinary addresses owners actually use", () => {
    // The hardening must not cost anyone their sign-in: plus-addressing,
    // subdomains, hyphens, and a non-ASCII (IDN) domain all stay valid.
    expect(normalizeEmail("Owner+pos@Sub.Venue-Co.com")).toBe(
      "owner+pos@sub.venue-co.com",
    );
    expect(normalizeEmail("inhaber@münchen.de")).toBe("inhaber@münchen.de");
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
