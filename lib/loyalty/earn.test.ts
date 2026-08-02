import { describe, expect, it } from "vitest";

import { earnedPointsFor } from "./earn";

/**
 * Loyalty earning arithmetic. `lib/loyalty/*` had no direct unit tests — earn
 * and redeem were exercised only through the webhook handler's mocks, which
 * assert that they FIRE, never what they compute.
 *
 * The documented contract: points are earned on the order's SUBTOTAL
 * (pre-discount, so a later redemption can't feed back into what was earned),
 * at a whole-dollar rate.
 */
describe("earnedPointsFor", () => {
  it("earns the rate for every whole dollar", () => {
    expect(earnedPointsFor(1000, 1)).toBe(10);
    expect(earnedPointsFor(1000, 3)).toBe(30);
  });

  it("floors part-dollars rather than rounding them up", () => {
    // $19.99 is nineteen whole dollars. Rounding up would let a venue's
    // liability exceed what the diner actually spent.
    expect(earnedPointsFor(1999, 1)).toBe(19);
    expect(earnedPointsFor(1999, 2)).toBe(38);
    expect(earnedPointsFor(99, 1)).toBe(0);
  });

  it("floors the DOLLARS, not the final points", () => {
    // 250c at rate 3 is 2 whole dollars × 3 = 6, not floor(2.5 × 3) = 7.
    expect(earnedPointsFor(250, 3)).toBe(6);
  });

  it("earns nothing on a zero or negative subtotal", () => {
    // A fully-discounted or malformed order must not mint points.
    expect(earnedPointsFor(0, 5)).toBe(0);
    expect(earnedPointsFor(-1000, 5)).toBe(0);
  });

  it("earns nothing when the venue's rate is zero or negative", () => {
    // Rate 0 is how a venue runs loyalty sign-ups without accruing liability.
    expect(earnedPointsFor(5000, 0)).toBe(0);
    expect(earnedPointsFor(5000, -2)).toBe(0);
  });

  it("scales linearly, so the ledger cannot drift from the subtotal", () => {
    const rate = 2;
    for (const cents of [100, 550, 1234, 98765]) {
      expect(earnedPointsFor(cents, rate)).toBe(
        Math.floor(cents / 100) * rate,
      );
    }
  });

  it("is pure — the same inputs always give the same points", () => {
    // Earning is re-derived by the cron sweep for any order the webhook missed,
    // so a non-deterministic result would credit a different amount depending on
    // which path ran.
    expect(earnedPointsFor(4321, 3)).toBe(earnedPointsFor(4321, 3));
  });
});
