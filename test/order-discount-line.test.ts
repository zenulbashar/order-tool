import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { orderDiscountLine } from "@/app/dashboard/orders/discount-line";

/**
 * Reconciling the printed receipt (audit P6).
 *
 * `applyOrderDiscounts` writes `totalCents = subtotal − promo − bank − points −
 * giftCard` and never rewrites `orders.subtotalCents` or
 * `order_items.line_total_cents`, so the itemised rows always sum to the
 * SUBTOTAL. All three owner surfaces printed those full-price rows directly
 * above the discounted Total: 3 × Burger $30.00, then Total $25.00, with
 * nothing accounting for the missing $5.
 *
 * The diner's receipt page and the notification email already print the
 * breakdown for the same order — `lib/customer/order-email.ts` carries the
 * comment saying that without it "the lines visibly sum to more than the stated
 * Total". The owner surfaces were left behind, and the docket has since gained
 * a GST line and a "Thank you", which makes it the artefact a venue keeps.
 */
describe("orderDiscountLine", () => {
  it("reconciles a discounted order to its total", () => {
    // The audit's own example: 3 x Burger @ $10 with a $5 promo.
    expect(orderDiscountLine(3000, 2500)).toEqual({
      subtotal: "30.00",
      discount: "5.00",
    });
  });

  it("renders nothing when the order carries no discount", () => {
    // The overwhelmingly common case. A "Discount $0.00" line on every docket
    // would be noise on 72mm of thermal paper.
    expect(orderDiscountLine(2500, 2500)).toBeNull();
  });

  it("reports the discount as a POSITIVE figure", () => {
    // The surfaces render their own minus sign. Returning a negative here would
    // print "-$-5.00" on paper.
    expect(orderDiscountLine(3000, 2500)!.discount).not.toContain("-");
  });

  it("renders nothing rather than a negative discount when total exceeds subtotal", () => {
    // The product charges no per-order fee, so this means data we do not
    // understand. An unexplained Total is a smaller error than a confidently
    // wrong breakdown that a venue might carry into its books.
    expect(orderDiscountLine(2500, 3000)).toBeNull();
  });

  it("handles a fully discounted order", () => {
    // A 100% promo or a gift card covering the lot. The rows still need to
    // reconcile to $0.00.
    expect(orderDiscountLine(3000, 0)).toEqual({
      subtotal: "30.00",
      discount: "30.00",
    });
  });

  it("keeps cents exact rather than rounding to dollars", () => {
    expect(orderDiscountLine(1999, 1750)).toEqual({
      subtotal: "19.99",
      discount: "2.49",
    });
  });
});

describe("the three owner surfaces", () => {
  const SURFACES = [
    "app/dashboard/orders/order-ticket.tsx",
    "app/dashboard/orders/order-card.tsx",
    "app/dashboard/orders/ticket-drawer.tsx",
  ];

  const source = (file: string) =>
    readFileSync(join(process.cwd(), file), "utf8");

  it("all print the breakdown from the SHARED decision", () => {
    // The same reason tax-line.ts exists: three surfaces styled differently
    // (the docket is monochrome and bold for a thermal printer) that must agree
    // on WHEN the breakdown appears. An inline `subtotal !== total` in one of
    // them is how they drift apart again.
    for (const file of SURFACES) {
      expect(source(file), `${file} must use the shared helper`).toContain(
        "orderDiscountLine(",
      );
    }
  });

  it("derives the breakdown from the order's OWN subtotal", () => {
    // Not from a re-summed item list. The line rows are immutable snapshots and
    // orders.subtotalCents is what they were written from, so re-deriving would
    // reintroduce exactly the drift this fixes.
    for (const file of SURFACES) {
      expect(source(file), file).toMatch(
        /orderDiscountLine\(\s*order\.subtotalCents,\s*order\.totalCents,?\s*\)/,
      );
    }
  });

  it("keeps a Total on every surface", () => {
    // The counterweight: the breakdown is added ABOVE the Total, never in place
    // of it. A surface that printed only Subtotal and Discount would be worse
    // than the bug.
    for (const file of SURFACES) {
      expect(source(file), file).toContain("formatCents(order.totalCents)");
    }
  });
});
