import { describe, expect, it } from "vitest";

import {
  paymentIntentCanBeAbandoned,
  STALE_CHECKOUT_MS,
} from "./abandoned-checkout";

/**
 * The abandoned-checkout sweep cancels a stale order only after Stripe says no
 * payment can land. Getting this table wrong in one direction cancels an order
 * the diner has just paid for; in the other it leaves gift-card value held
 * forever. Every PaymentIntent status is pinned.
 */
describe("paymentIntentCanBeAbandoned", () => {
  it.each([
    "requires_payment_method",
    "requires_confirmation",
    "requires_action",
    "canceled",
  ] as const)("lets a %s intent be abandoned — nothing has been taken", (status) => {
    expect(paymentIntentCanBeAbandoned(status)).toBe(true);
  });

  it.each(["processing", "requires_capture", "succeeded"] as const)(
    "leaves a %s intent alone — money is in motion or has arrived",
    (status) => {
      expect(paymentIntentCanBeAbandoned(status)).toBe(false);
    },
  );
});

describe("STALE_CHECKOUT_MS", () => {
  it("gives a diner a full day to come back before the order is closed", () => {
    expect(STALE_CHECKOUT_MS).toBe(24 * 60 * 60 * 1000);
  });
});
