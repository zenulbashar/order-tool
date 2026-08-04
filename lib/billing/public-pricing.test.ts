import { describe, expect, it } from "vitest";

import {
  annualSavingPercent,
  formatPlanAmount,
  PUBLIC_PLANS,
} from "./public-pricing";
import { PLAN_PRICE_LOOKUP_KEYS } from "./stripe-prices";

/**
 * The landing page renders these two pure functions straight into public,
 * indexable copy, so a wrong return value is a published price claim rather than
 * a cosmetic bug. The Stripe fetch itself is I/O and is covered by its own
 * fail-closed design (it returns {} on any error); what is asserted here is the
 * arithmetic and formatting that turn a Stripe amount into what a visitor reads.
 */
describe("formatPlanAmount", () => {
  it("drops the cents on a round amount so a headline reads $89, not $89.00", () => {
    expect(formatPlanAmount(8900, "AUD")).toBe("$89");
  });

  it("keeps the cents when the price actually has them", () => {
    expect(formatPlanAmount(8950, "AUD")).toBe("$89.50");
  });

  it("formats zero without inventing a decimal", () => {
    expect(formatPlanAmount(0, "AUD")).toBe("$0");
  });

  it("uses a narrow symbol so AUD does not render as A$ in the headline", () => {
    // Guards the currencyDisplay option: the default would give "A$89", which
    // reads as a different currency to an Australian visitor.
    expect(formatPlanAmount(8900, "AUD")).not.toContain("A$");
  });
});

describe("annualSavingPercent", () => {
  const base = { monthlyCents: 10000, currency: "AUD" };

  it("returns the rounded discount against twelve months at the monthly rate", () => {
    // 12 x $100 = $1200; $960 annual is a 20% saving.
    expect(annualSavingPercent({ ...base, annualCents: 96000 })).toBe(20);
  });

  it("returns null when there is no annual price", () => {
    expect(annualSavingPercent({ ...base, annualCents: null })).toBeNull();
  });

  it("returns null rather than a negative badge when annual costs MORE", () => {
    // A misconfigured Stripe price must never render "Save -4% paying annually".
    expect(annualSavingPercent({ ...base, annualCents: 125000 })).toBeNull();
  });

  it("returns null when annual exactly equals twelve monthly payments", () => {
    expect(annualSavingPercent({ ...base, annualCents: 120000 })).toBeNull();
  });

  it("returns null for a zero or negative monthly price", () => {
    expect(
      annualSavingPercent({ monthlyCents: 0, annualCents: 9600, currency: "AUD" }),
    ).toBeNull();
  });
});

describe("PUBLIC_PLANS", () => {
  it("lists only tiers the billing system can actually sell", () => {
    // The landing page advertised "Starter" and "Growth" for weeks; neither
    // exists in the plan enum, so a visitor could not buy what the page sold.
    // Deriving the public list from the paid-plan type is what stops that
    // recurring: a tier with no Stripe lookup keys cannot be advertised.
    expect([...PUBLIC_PLANS]).toEqual(["pro", "scale"]);
    for (const plan of PUBLIC_PLANS) {
      expect(PLAN_PRICE_LOOKUP_KEYS[plan].monthly).toBeTruthy();
      expect(PLAN_PRICE_LOOKUP_KEYS[plan].annual).toBeTruthy();
    }
  });
});
