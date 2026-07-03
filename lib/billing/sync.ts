import "server-only";

import { eq } from "drizzle-orm";
import type Stripe from "stripe";

import { db } from "@/lib/db";
import { venues } from "@/lib/db/schema";

import type { Plan } from "./plans";
import { isRosterLookupKey, planFromLookupKey } from "./stripe-prices";

/**
 * The plan/status sync logic the SEPARATE billing webhook delegates to (Phase 2).
 * Pure derivation + idempotent writes — no Stripe-signature or HTTP concerns
 * here, and nothing in this file touches the order/diner money path.
 *
 * Entitlement still flows from `plan` alone (hasFeature). This module's whole job
 * is to keep venue.plan / venue.plan_status / venue.trial_ends_at in sync with
 * the Stripe subscription, so no feature check anywhere needs to know about
 * Stripe.
 */

/**
 * Subscription statuses where the venue LOSES paid access and drops to the
 * `free` baseline. Deliberately excludes `past_due`: a single failed renewal
 * must NOT take a storefront dark mid-service — Stripe's smart retries get a
 * grace window, and only a fully lapsed/canceled subscription downgrades.
 */
const DOWNGRADE_STATUSES: ReadonlySet<Stripe.Subscription.Status> = new Set([
  "canceled",
  "unpaid",
  "incomplete_expired",
  "paused",
]);

/** Unwrap a Stripe id | expanded object | null into a plain id string. */
function stripeId(
  ref: string | { id: string } | null | undefined,
): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}

/**
 * Map a Stripe subscription status to the stored plan_status (free text).
 * Stored close to verbatim — plan_status is intentionally not an enum so the
 * full Stripe vocabulary round-trips — with the one "never really started"
 * variant collapsed to `canceled` for a single lapsed label.
 */
export function planStatusFromStripe(
  status: Stripe.Subscription.Status,
): string {
  return status === "incomplete_expired" ? "canceled" : status;
}

/**
 * Derive the venue plan tier from a subscription:
 *   - trialing            -> `trial` (Phase 1 maps trial -> ALL features, i.e.
 *                            Scale-level access regardless of the chosen tier's
 *                            price; this is how "trial = Scale-level" reconciles
 *                            with Stripe attaching the trial to a specific price).
 *   - canceled/unpaid/...  -> `free` (lapsed baseline; see DOWNGRADE_STATUSES).
 *   - otherwise            -> the purchased tier from the price lookup key
 *                            (`past_due` keeps the tier during the grace window).
 * An unknown lookup key falls back to `free` rather than guessing a paid tier.
 */
export function planFromSubscription(subscription: Stripe.Subscription): Plan {
  if (subscription.status === "trialing") return "trial";
  if (DOWNGRADE_STATUSES.has(subscription.status)) return "free";
  // Consolidated billing (Track C): the subscription may carry multiple items
  // (plan + Roster add-on), so the plan tier must come from the item whose
  // lookup key IS a plan key — NOT items.data[0], which could be the Roster
  // line. Scanning here is what stops "add Roster" from silently downgrading a
  // venue to free.
  const planItem = subscription.items.data.find(
    (item) => planFromLookupKey(item.price.lookup_key) !== null,
  );
  const tier = planFromLookupKey(planItem?.price.lookup_key);
  return tier ?? "free";
}

/**
 * Whether the subscription currently entitles the venue to the Roster add-on:
 * a Roster-keyed item is present AND the subscription hasn't lapsed. Feeds
 * venue.roster_entitled, which the Roster SSO handoff reads into its
 * entitlements.roster claim (Build 4).
 */
export function rosterEntitledFromSubscription(
  subscription: Stripe.Subscription,
): boolean {
  if (DOWNGRADE_STATUSES.has(subscription.status)) return false;
  return subscription.items.data.some((item) =>
    isRosterLookupKey(item.price.lookup_key),
  );
}

/**
 * Resolve which venue an event belongs to. Prefers the venueId we stamp in
 * metadata on the customer + subscription + checkout session; falls back to the
 * stored stripe_subscription_id / stripe_customer_id columns for events that
 * don't carry our metadata (invoices). Returns null when nothing matches, so the
 * webhook can ack and move on rather than error.
 */
export async function resolveVenueId(refs: {
  metadataVenueId?: string | null;
  subscriptionId?: string | null;
  customerId?: string | null;
}): Promise<string | null> {
  if (refs.metadataVenueId) return refs.metadataVenueId;

  if (refs.subscriptionId) {
    const rows = await db
      .select({ id: venues.id })
      .from(venues)
      .where(eq(venues.stripeSubscriptionId, refs.subscriptionId))
      .limit(1);
    if (rows[0]) return rows[0].id;
  }

  if (refs.customerId) {
    const rows = await db
      .select({ id: venues.id })
      .from(venues)
      .where(eq(venues.stripeCustomerId, refs.customerId))
      .limit(1);
    if (rows[0]) return rows[0].id;
  }

  return null;
}

/**
 * Sync a venue's plan + status from a Stripe subscription. Idempotent: it SETs
 * derived values (never increments), so duplicate or out-of-order webhook
 * deliveries converge to the same row state. Also persists the subscription +
 * customer ids so later metadata-less events (invoices) resolve by column.
 */
export async function syncVenueFromSubscription(
  venueId: string,
  subscription: Stripe.Subscription,
): Promise<void> {
  const plan = planFromSubscription(subscription);
  const planStatus = planStatusFromStripe(subscription.status);
  const rosterEntitled = rosterEntitledFromSubscription(subscription);
  const trialEndsAt = subscription.trial_end
    ? new Date(subscription.trial_end * 1000)
    : null;
  const customerId = stripeId(subscription.customer);

  await db
    .update(venues)
    .set({
      plan,
      planStatus,
      rosterEntitled,
      trialEndsAt,
      stripeSubscriptionId: subscription.id,
      ...(customerId ? { stripeCustomerId: customerId } : {}),
    })
    .where(eq(venues.id, venueId));
}

/**
 * Set just the plan_status (used for invoice.payment_failed -> past_due). Keeps
 * the current plan/tier untouched: a failed payment must not revoke access while
 * Stripe is still retrying. Idempotent.
 */
export async function setVenuePlanStatus(
  venueId: string,
  planStatus: string,
): Promise<void> {
  await db
    .update(venues)
    .set({ planStatus })
    .where(eq(venues.id, venueId));
}
