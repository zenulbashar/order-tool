import { describe, expect, it } from "vitest";

import { decideSubscriptionCheckout, TRIAL_DAYS } from "./checkout-policy";

/**
 * Stripe Checkout in subscription mode always creates a NEW subscription, so
 * the decision below is what stands between an owner clicking "Choose" twice
 * and being billed twice. Every path is pinned.
 */
describe("decideSubscriptionCheckout", () => {
  it("starts a trial subscription for a venue that has never subscribed", () => {
    // New venues default to plan_status 'trialing' with no subscription.
    expect(
      decideSubscriptionCheckout({
        stripeSubscriptionId: null,
        planStatus: "trialing",
      }),
    ).toEqual({ kind: "start", trialDays: TRIAL_DAYS });
  });

  it.each(["trialing", "active", "past_due", "unpaid", "paused", "incomplete"])(
    "sends a venue whose subscription is %s to the portal instead of a second Checkout",
    (planStatus) => {
      expect(
        decideSubscriptionCheckout({
          stripeSubscriptionId: "sub_live",
          planStatus,
        }),
      ).toEqual({ kind: "portal" });
    },
  );

  it("lets a venue whose subscription was canceled subscribe again, without another trial", () => {
    expect(
      decideSubscriptionCheckout({
        stripeSubscriptionId: "sub_old",
        planStatus: "canceled",
      }),
    ).toEqual({ kind: "start", trialDays: null });
  });
});
