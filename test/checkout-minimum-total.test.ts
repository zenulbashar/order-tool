import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MIN_TOTAL_CENTS as FROM_BANK_DISCOUNT } from "@/lib/payments/bank-discount";
import { MIN_TOTAL_CENTS } from "@/lib/payments/limits";

/**
 * `placeOrder` must reject a below-minimum total BEFORE it writes anything.
 *
 * Stripe rejects a PaymentIntent under its AUD minimum, and in placeOrder that
 * rejection arrives after the order transaction has already committed — so the
 * failure mode is not a clean error but an orphan `pending_payment` row that the
 * kitchen board hides and no sweep clears, plus a generic "We couldn't start
 * payment." for the diner.
 *
 * The discounted path always clamped to this floor; the plain path did not, so a
 * venue pricing a single item under $0.50 could take an unpayable order.
 *
 * Asserted from the SOURCE rather than by driving the action, because the thing
 * that matters is ORDERING — a guard that runs after the insert is worthless, and
 * that is invisible to any test that only checks the return value.
 */
const ACTIONS = readFileSync(
  join(process.cwd(), "app/[slug]/checkout/actions.ts"),
  "utf8",
);

describe("checkout minimum total", () => {
  it("has ONE definition of the floor, shared by both paths", () => {
    // If these ever diverge, a discount could clamp to a different floor than
    // the one checkout enforces, and orders would fail asymmetrically.
    expect(MIN_TOTAL_CENTS).toBe(FROM_BANK_DISCOUNT);
    expect(MIN_TOTAL_CENTS).toBeGreaterThan(0);
  });

  it("is enforced in placeOrder", () => {
    expect(ACTIONS).toContain("MIN_TOTAL_CENTS");
    expect(ACTIONS).toMatch(/totalCents\s*<\s*MIN_TOTAL_CENTS/);
  });

  it("guards BEFORE any database write, not after", () => {
    const guard = ACTIONS.search(/totalCents\s*<\s*MIN_TOTAL_CENTS/);
    const write = ACTIONS.indexOf("db.transaction");
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(write).toBeGreaterThanOrEqual(0);
    expect(
      guard,
      "the minimum-total guard must run before the order transaction — after it, " +
        "the row is already committed and the guard cannot prevent the orphan it exists to prevent",
    ).toBeLessThan(write);
  });

  it("guards BEFORE the PaymentIntent is created", () => {
    const guard = ACTIONS.search(/totalCents\s*<\s*MIN_TOTAL_CENTS/);
    const intent = ACTIONS.indexOf("paymentIntents.create");
    expect(intent).toBeGreaterThanOrEqual(0);
    expect(guard).toBeLessThan(intent);
  });

  it("does not import a discount module into the plain checkout path", () => {
    // The money-path invariant: placeOrder carries no promo/discount/integration
    // logic. The floor is a Stripe platform limit, so it lives in
    // lib/payments/limits.ts — importing it from bank-discount.ts would read as
    // a violation to the next reviewer even though a constant carries no logic.
    expect(ACTIONS).toContain('from "@/lib/payments/limits"');
    expect(ACTIONS).not.toContain("bank-discount");
  });
});
