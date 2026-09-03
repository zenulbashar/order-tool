/**
 * Pure decision for the "Choose a plan" CTA: may this venue start a NEW
 * Stripe Checkout subscription, and if so does it get the free trial?
 *
 * Checkout in `subscription` mode always CREATES a subscription — it cannot
 * modify one. So for a venue whose stored subscription still exists in Stripe,
 * a second Checkout would leave it with TWO subscriptions billing in parallel
 * (and a fresh 30-day trial on the second, making the venue look fully
 * entitled while the first keeps charging). Plan and interval changes for a
 * live subscription belong in the Billing Portal, which prices and confirms
 * the change on the existing subscription instead.
 *
 * Kept pure (no Stripe, no DB) so the Server Function and the Billing page
 * make the SAME call from the venue row — the page hides the CTA, the action
 * is the control.
 */

export const TRIAL_DAYS = 30;

export type SubscriptionCheckoutDecision =
  | { kind: "start"; trialDays: number | null }
  | { kind: "portal" };

export function decideSubscriptionCheckout(venue: {
  stripeSubscriptionId: string | null;
  planStatus: string;
}): SubscriptionCheckoutDecision {
  const hasSubscription = venue.stripeSubscriptionId !== null;
  // `canceled` is the ONE stored status under which the subscription is gone
  // for good (incomplete_expired collapses into it — see planStatusFromStripe).
  // Every other status — trialing, active, past_due, unpaid, paused,
  // incomplete — is a subscription that still exists in Stripe and must be
  // managed, not duplicated.
  if (hasSubscription && venue.planStatus !== "canceled") {
    return { kind: "portal" };
  }
  // The trial is a one-per-venue introduction. A venue that has had a
  // subscription before (now canceled) re-subscribes at full price; otherwise
  // cancel-and-resubscribe would mint an indefinite series of free months.
  return { kind: "start", trialDays: hasSubscription ? null : TRIAL_DAYS };
}
