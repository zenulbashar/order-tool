import { describe, expect, it } from "vitest";

import {
  buildInsightsFacts,
  formatFactsForModel,
  INSIGHTS_FIGURE_MAX,
  INSIGHTS_QUESTION_MAX,
  type InsightsOrder,
  parseInsightsAnswer,
  sanitiseQuestion,
} from "@/lib/insights-core";

// Tuesday 1 Sep 2026, 10:30 in Brisbane (UTC+10, no DST).
const NOW = new Date("2026-09-15T02:00:00Z");
const TZ = "Australia/Brisbane";

let seq = 0;
function order(overrides: Partial<InsightsOrder> = {}): InsightsOrder {
  seq += 1;
  return {
    id: `o${seq}`,
    totalCents: 5500,
    taxCents: 500,
    orderType: "pickup",
    createdAt: new Date("2026-09-14T02:00:00Z"),
    scheduledFor: null,
    discountCents: 0,
    promoDiscountCents: 0,
    pointsDiscountCents: 0,
    giftCardRedeemedCents: 0,
    customerId: null,
    ...overrides,
  };
}

describe("buildInsightsFacts", () => {
  it("nets refunds per order and apportions GST", () => {
    const facts = buildInsightsFacts({
      orders: [order({ id: "a" }), order({ id: "b" })],
      items: [],
      refundedByOrder: new Map([["a", 1000]]),
      timeZone: TZ,
      now: NOW,
    });
    expect(facts.totals.revenueCents).toBe(5500 + 4500);
    expect(facts.totals.refundedCents).toBe(1000);
    expect(facts.totals.orders).toBe(2);
    expect(facts.totals.avgOrderCents).toBe(5000);
    // 500 GST on 5500 → the refunded 1000 carries 91 of it.
    expect(facts.totals.gstCents).toBe(500 + (500 - 91));
  });

  it("buckets hours and weekdays in the venue's zone, not UTC", () => {
    // 2026-09-01T00:30Z is Tuesday 10:30 in Brisbane; Monday 17:30 in New York.
    const facts = buildInsightsFacts({
      orders: [order({ createdAt: new Date("2026-09-01T00:30:00Z") })],
      items: [],
      refundedByOrder: new Map(),
      timeZone: TZ,
      now: NOW,
    });
    expect(facts.byHour[10].orders).toBe(1);
    expect(facts.byHour[0].orders).toBe(0);
    expect(facts.byWeekday.find((d) => d.weekday === "Tue")?.orders).toBe(1);
    expect(facts.byWeekday.find((d) => d.weekday === "Mon")?.orders).toBe(0);
    expect(facts.byDay.find((d) => d.day === "2026-09-01")?.orders).toBe(1);
  });

  it("splits the last seven venue-local days from the seven before", () => {
    const facts = buildInsightsFacts({
      orders: [
        order({ totalCents: 8000, createdAt: new Date("2026-09-12T02:00:00Z") }), // 3 days ago
        order({ totalCents: 4000, createdAt: new Date("2026-09-05T02:00:00Z") }), // 10 days ago
        order({ totalCents: 9999, createdAt: new Date("2026-08-20T02:00:00Z") }), // outside both
      ],
      items: [],
      refundedByOrder: new Map(),
      timeZone: TZ,
      now: NOW,
    });
    expect(facts.weekOverWeek.last7RevenueCents).toBe(8000);
    expect(facts.weekOverWeek.prior7RevenueCents).toBe(4000);
    expect(facts.weekOverWeek.revenueChangePct).toBe(100);
    expect(facts.byDay).toHaveLength(30);
    expect(facts.byDay[facts.byDay.length - 1].day).toBe("2026-09-15");
  });

  it("reports null change when the prior week had no revenue", () => {
    const facts = buildInsightsFacts({
      orders: [order()],
      items: [],
      refundedByOrder: new Map(),
      timeZone: TZ,
      now: NOW,
    });
    expect(facts.weekOverWeek.revenueChangePct).toBeNull();
  });

  it("ranks items by revenue and counts repeat customers", () => {
    const facts = buildInsightsFacts({
      orders: [
        order({ customerId: "c1" }),
        order({ customerId: "c1" }),
        order({ customerId: "c2" }),
        order({ orderType: "dine_in" }),
        order({ scheduledFor: new Date("2026-09-14T03:00:00Z") }),
      ],
      items: [
        { name: "Latte", quantity: 10, lineTotalCents: 4500 },
        { name: "Pie", quantity: 2, lineTotalCents: 1600 },
        { name: "Latte", quantity: 5, lineTotalCents: 2250 },
      ],
      refundedByOrder: new Map(),
      timeZone: TZ,
      now: NOW,
    });
    expect(facts.topItems[0]).toEqual({ name: "Latte", quantity: 15, revenueCents: 6750 });
    expect(facts.customers).toEqual({ withAccount: 2, guest: 2, repeat: 1 });
    expect(facts.orderTypes).toEqual({ dineIn: 1, pickup: 4, scheduledPickup: 1 });
  });

  it("presents the sheet to the model in dollars and drops empty hours", () => {
    const facts = buildInsightsFacts({
      orders: [order({ totalCents: 1234 })],
      items: [],
      refundedByOrder: new Map(),
      timeZone: TZ,
      now: NOW,
    });
    const text = formatFactsForModel(facts);
    expect(text).toContain('"revenue":12.34');
    expect(JSON.parse(text).byHour).toHaveLength(1);
    expect(text).not.toContain("Cents");
  });
});

describe("sanitiseQuestion / parseInsightsAnswer", () => {
  it("collapses whitespace, caps length, and rejects empties", () => {
    expect(sanitiseQuestion("  what   sold\n best? ")).toBe("what sold best?");
    expect(sanitiseQuestion("x".repeat(INSIGHTS_QUESTION_MAX + 50))).toHaveLength(INSIGHTS_QUESTION_MAX);
    expect(sanitiseQuestion("  ")).toBeNull();
    expect(sanitiseQuestion(42)).toBeNull();
  });

  it("validates the model reply and bounds the figures", () => {
    expect(parseInsightsAnswer(null)).toBeNull();
    expect(parseInsightsAnswer({ figures: [] })).toBeNull();
    const parsed = parseInsightsAnswer({
      answer: " Tuesday was best. ",
      figures: Array.from({ length: 10 }, (_, i) => ({ label: `L${i}`, value: `V${i}` })),
      coverage: "bogus",
    });
    expect(parsed?.answer).toBe("Tuesday was best.");
    expect(parsed?.figures).toHaveLength(INSIGHTS_FIGURE_MAX);
    expect(parsed?.coverage).toBe("full");
  });
});
