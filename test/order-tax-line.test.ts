import { describe, expect, it } from "vitest";

import { taxLineText } from "@/app/dashboard/orders/tax-line";

/**
 * The owner-facing GST line. `taxCents` has been captured on every order since
 * migration 0035 but was only ever shown to the DINER and as a 30-day total, so
 * an owner could not see the GST on an individual order — the figure a BAS is
 * assembled from.
 *
 * Three surfaces render it (board card, ticket drawer, printed docket) with
 * different styling, so only the DECISION is shared. These pin that decision,
 * because the ways it can be wrong are all quiet: a $0 line printed on every
 * docket for a venue that does not charge GST, or a line that reads as an
 * ADDITION to the total when the tax is inclusive.
 */
describe("taxLineText", () => {
  it("renders an inclusive line when the venue charges GST", () => {
    expect(taxLineText("GST", 250)).toBe("incl. GST $2.50");
  });

  it("says 'incl.' — the tax is a component of the total, not added to it", () => {
    // If this ever reads as an addition, an owner reconciling a BAS would
    // double-count. The diner receipt uses the same wording.
    const line = taxLineText("GST", 250)!;
    expect(line.startsWith("incl.")).toBe(true);
    expect(line).not.toMatch(/\bplus\b|\+/);
  });

  it("returns null when the venue has GST off", () => {
    // page.tsx folds `taxEnabled` into a null label, so a venue with tax
    // disabled never reaches a surface with a label at all.
    expect(taxLineText(null, 250)).toBeNull();
  });

  it("returns null for a zero component, so no $0.00 line prints", () => {
    expect(taxLineText("GST", 0)).toBeNull();
  });

  it("returns null for a negative component rather than printing one", () => {
    expect(taxLineText("GST", -100)).toBeNull();
  });

  it("honours a venue's custom label rather than hardcoding GST", () => {
    // venues.tax_label is configurable; AU defaults to GST but the column is
    // free text, and a hardcoded label would be wrong for anyone who changed it.
    expect(taxLineText("VAT", 1000)).toBe("incl. VAT $10.00");
  });

  it("formats whole dollars with cents, matching every other money string", () => {
    expect(taxLineText("GST", 100)).toBe("incl. GST $1.00");
    expect(taxLineText("GST", 5)).toBe("incl. GST $0.05");
  });
});
