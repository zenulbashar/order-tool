import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { menuHref } from "@/app/[slug]/table-link";

/**
 * The dine-in table must survive navigation.
 *
 * The printed QR points at `/{slug}?table=<label>` — the LANDING view — but
 * ordering happens on `/{slug}/menu`, and all three routes between the two used
 * to hard-code a table-less href. Nothing else persists the label: the cart
 * stores only item ids, there is no cookie and no middleware. So a diner who
 * scanned at table 12 reached checkout with no table, fell back to `pickup`, and
 * the docket printed PICKUP while the tables board never saw them — the QR
 * feature defeated on effectively every scan, with the vanishing "Table 12" pill
 * as the only cue.
 */
describe("menuHref", () => {
  it("carries the table when there is one", () => {
    expect(menuHref("pizzaco", "12")).toBe("/pizzaco/menu?table=12");
  });

  it("omits the query entirely when there is no table", () => {
    // Pickup diners must not get a stray `?table=` — it would read as dine-in.
    expect(menuHref("pizzaco", null)).toBe("/pizzaco/menu");
    expect(menuHref("pizzaco", undefined)).toBe("/pizzaco/menu");
    expect(menuHref("pizzaco", "")).toBe("/pizzaco/menu");
  });

  it("puts the query BEFORE the fragment", () => {
    // The only valid ordering: a fragment swallows everything after it, so
    // `/menu#drinks?table=12` would lose the table silently.
    expect(menuHref("pizzaco", "12", "drinks")).toBe(
      "/pizzaco/menu?table=12#drinks",
    );
  });

  it("still anchors when there is no table", () => {
    expect(menuHref("pizzaco", null, "drinks")).toBe("/pizzaco/menu#drinks");
  });

  it("encodes a label that would otherwise break the URL", () => {
    // Table labels are owner free text — "Bar 1 & 2", "Table #3", "Patio/Left".
    expect(menuHref("pizzaco", "Bar 1 & 2")).toBe(
      "/pizzaco/menu?table=Bar%201%20%26%202",
    );
    expect(menuHref("pizzaco", "Table #3")).toBe("/pizzaco/menu?table=Table%20%233");
  });
});

describe("every route to the menu uses it", () => {
  it("leaves no hand-built table-less menu href behind", () => {
    // Three hand-built hrefs is exactly how this drifted. A literal here means
    // a diner loses their table on that path.
    for (const file of [
      "app/[slug]/storefront.tsx",
      "app/[slug]/category-tiles.tsx",
    ]) {
      const src = readFileSync(join(process.cwd(), file), "utf8");
      expect(src, `${file} should route via menuHref`).toContain("menuHref");
      expect(
        src,
        `${file} still hard-codes a menu href that drops the table`,
      ).not.toMatch(/href=\{`\/\$\{[^}]*\}\/menu(#|`)/);
    }
  });
});
