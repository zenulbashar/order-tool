import { describe, expect, it } from "vitest";

import { normalizeMenuItemName } from "./item-name";

/**
 * One definition of "same name", shared by the thing that PENALISES duplicates
 * (lib/menu-health.ts grades `duplicate_name` as critical) and the thing that
 * used to CREATE them (the AI menu import appended blindly).
 *
 * The two only reinforce each other while they agree, so these pin the exact
 * comparison — including what it deliberately does NOT fold, since being too
 * clever here silently refuses to import a legitimately different product.
 */
describe("normalizeMenuItemName", () => {
  it("ignores case", () => {
    expect(normalizeMenuItemName("Flat White")).toBe(
      normalizeMenuItemName("flat white"),
    );
  });

  it("ignores surrounding whitespace", () => {
    expect(normalizeMenuItemName("  Latte  ")).toBe(
      normalizeMenuItemName("Latte"),
    );
  });

  it("treats a blank name as empty, so blanks are handled by the caller", () => {
    // menu-health flags blank names separately as `no_name` and skips them in
    // duplicate grouping; import validation rejects them before publish.
    expect(normalizeMenuItemName("   ")).toBe("");
  });

  it("does NOT fold internal whitespace", () => {
    // "Iced  Latte" (double space) vs "Iced Latte" are plausibly the same, but
    // collapsing here would be a guess. Kept distinct deliberately.
    expect(normalizeMenuItemName("Iced  Latte")).not.toBe(
      normalizeMenuItemName("Iced Latte"),
    );
  });

  it("does NOT fold accents or punctuation", () => {
    // "Cafe Latte" and "Café Latte" can be different products on a real menu.
    // Refusing to import the second would be worse than allowing both.
    expect(normalizeMenuItemName("Café Latte")).not.toBe(
      normalizeMenuItemName("Cafe Latte"),
    );
    expect(normalizeMenuItemName("Fish & Chips")).not.toBe(
      normalizeMenuItemName("Fish and Chips"),
    );
  });

  it("is idempotent", () => {
    const once = normalizeMenuItemName(" Flat White ");
    expect(normalizeMenuItemName(once)).toBe(once);
  });
});
