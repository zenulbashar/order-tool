import type Stripe from "stripe";

/**
 * The admin-granted plan discount (venues.plan_discount_mode / _value) as a
 * Stripe coupon. One definition shared by the admin console (which applies it
 * to a LIVE subscription) and createBillingCheckout (which applies it when the
 * venue first subscribes). Before the latter existed, a discount saved for a
 * venue with no subscription — which the form promised "only applies once the
 * venue is on a paid plan" — was read by nothing at all. Pure.
 */
export type PlanDiscountMode = "off" | "percent" | "amount";

export function planDiscountCouponParams(
  mode: PlanDiscountMode,
  value: number,
): Stripe.CouponCreateParams | null {
  if (mode === "percent" && Number.isInteger(value) && value >= 1 && value <= 100) {
    return { percent_off: value, duration: "forever" };
  }
  if (mode === "amount" && Number.isInteger(value) && value > 0) {
    return { amount_off: value, currency: "aud", duration: "forever" };
  }
  return null;
}
