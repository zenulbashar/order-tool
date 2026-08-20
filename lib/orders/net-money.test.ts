import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { netOrderMoney } from "./net-money";

/**
 * The arithmetic behind reconciling Reports with Payments (audit P8).
 *
 * These are BAS figures. The failure mode this replaces was not a rounding
 * disagreement — it was a $55 order reading as $0.00 revenue and $0.00 GST
 * because one cent had gone back — so the cases below are mostly about the
 * boundaries where a naive netting goes wrong in a way nobody would notice.
 */
describe("netOrderMoney", () => {
  it("nets a partial refund off the total", () => {
    // The audit's own example: $55 order, $10 goodwill refund.
    expect(netOrderMoney(5500, 500, 1000).netTotalCents).toBe(4500);
  });

  it("gives back GST in the same proportion as the money", () => {
    // $10 of $55 is 18.18%; 18.18% of $5.00 GST is $0.91.
    expect(netOrderMoney(5500, 500, 1000).netTaxCents).toBe(409);
  });

  it("leaves an unrefunded order exactly as it was", () => {
    // The overwhelmingly common case must be a no-op to the cent.
    expect(netOrderMoney(5500, 500, 0)).toEqual({
      netTotalCents: 5500,
      netTaxCents: 500,
      refundedCents: 0,
    });
  });

  it("takes a fully refunded order to zero on BOTH figures", () => {
    // Rounding the refunded tax rather than the remainder is what makes this
    // land on exactly 0 instead of leaving a stray cent of GST behind.
    expect(netOrderMoney(5500, 500, 5500)).toEqual({
      netTotalCents: 0,
      netTaxCents: 0,
      refundedCents: 5500,
    });
  });

  it("never returns negative revenue when the refund exceeds the total", () => {
    // planRefund enforces that refunds cannot exceed the total, but this reads
    // aggregated rows rather than enforcing it — a bad row must clamp, not
    // subtract a venue's revenue below zero.
    expect(netOrderMoney(5500, 500, 9999)).toEqual({
      netTotalCents: 0,
      netTaxCents: 0,
      refundedCents: 5500,
    });
  });

  it("leaves tax alone for a venue that charges none", () => {
    // taxCents is 0 whenever GST is off. Apportioning must not invent a figure.
    expect(netOrderMoney(5500, 0, 1000)).toEqual({
      netTotalCents: 4500,
      netTaxCents: 0,
      refundedCents: 1000,
    });
  });

  it("does not divide by zero on a fully discounted order", () => {
    // A 100% promo or a gift card covering the lot leaves totalCents at 0.
    expect(netOrderMoney(0, 0, 0)).toEqual({
      netTotalCents: 0,
      netTaxCents: 0,
      refundedCents: 0,
    });
  });

  it("keeps the refunded GST proportional at an awkward ratio", () => {
    // A third of a $10.00 order carrying $0.91 GST: round(91 * 333 / 1000) = 30.
    expect(netOrderMoney(1000, 91, 333).netTaxCents).toBe(61);
  });

  it("nets a one-cent refund without zeroing the order", () => {
    // The whole point. One cent used to remove the entire order from Reports.
    const net = netOrderMoney(5500, 500, 1);
    expect(net.netTotalCents).toBe(5499);
    expect(net.netTaxCents).toBe(500);
  });

  it("never returns tax larger than the order carried", () => {
    for (const refunded of [0, 1, 250, 2750, 5499, 5500]) {
      const net = netOrderMoney(5500, 500, refunded);
      expect(net.netTaxCents).toBeLessThanOrEqual(500);
      expect(net.netTaxCents).toBeGreaterThanOrEqual(0);
      expect(net.netTotalCents).toBeLessThanOrEqual(5500);
      expect(net.netTotalCents).toBeGreaterThanOrEqual(0);
    }
  });
});

/**
 * The five aggregate sites, pinned together.
 *
 * The defect was never one bad line — it was TWO conventions for "revenue over
 * 30 days" living side by side and nothing making them agree. `PlatformAudit-
 * 2026-07.md` even asserts "Revenue reporting is now net of refunds", which was
 * true of the Payments card and false of everything else. So the fix is only
 * durable if a sixth aggregate cannot quietly pick the old convention.
 */
describe("revenue aggregate sites", () => {
  const source = (file: string) =>
    readFileSync(join(process.cwd(), file), "utf8");

  /** Sites that aggregate venue money over a window. */
  const MONEY_SITES = [
    "app/dashboard/reports/page.tsx",
    "app/dashboard/page.tsx",
    "app/admin/stats/page.tsx",
    "app/dashboard/payments/queries.ts",
  ];

  /** Sites that only COUNT orders — right status set, nothing to net. */
  const COUNT_SITES = ["app/admin/page.tsx"];

  it("never filters an order aggregate on confirmed alone", () => {
    const narrow: string[] = [];
    for (const file of [...MONEY_SITES, ...COUNT_SITES]) {
      if (/eq\(\s*orders\.status,\s*"confirmed"\s*\)/.test(source(file))) {
        narrow.push(file);
      }
    }
    expect(
      narrow,
      `Aggregates filtering on 'confirmed' alone. syncOrderRefundStatus ` +
        `rewrites the status on any refund, so ONE refunded cent drops the ` +
        `whole order out of these figures:\n` +
        narrow.map((f) => `  ${f}`).join("\n"),
    ).toEqual([]);
  });

  it("resolves every site against the shared PAID grouping", () => {
    for (const file of [...MONEY_SITES, ...COUNT_SITES]) {
      expect(source(file), file).toContain("PAID_ORDER_STATUSES");
    }
  });

  it("subtracts succeeded refunds wherever money is summed", () => {
    // The status widening ALONE would be worse than the bug: it would count a
    // refunded order at full value. The two halves have to ship together.
    for (const file of MONEY_SITES) {
      expect(source(file), `${file} must read succeeded refunds`).toMatch(
        /refunds\.status,\s*"succeeded"/,
      );
    }
  });

  it("attributes a refund to its ORDER's window, not its own", () => {
    // A refund issued on day 31 for an order placed on day 29 belongs in the
    // window that counted the sale. Joining orders to refunds is what does it;
    // filtering on refunds.createdAt would silently split the pair.
    for (const file of MONEY_SITES) {
      expect(source(file), file).toMatch(
        /innerJoin\(\s*orders,\s*eq\(orders\.id,\s*refunds\.orderId\)/,
      );
    }
  });

  it("nets through the shared helper on the sites that report GST", () => {
    // Reports prints a GST figure, so it needs the apportionment rather than a
    // flat subtraction. The helper is what carries that.
    expect(source("app/dashboard/reports/page.tsx")).toContain("netOrderMoney(");
  });
});
