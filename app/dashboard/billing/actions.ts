"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import {
  resolvePriceId,
  type BillingInterval,
  type PaidPlan,
} from "@/lib/billing/stripe-prices";
import { db } from "@/lib/db";
import { venues } from "@/lib/db/schema";
import { getStripe } from "@/lib/stripe";
import { requireUser, requireVenue } from "@/lib/tenant";
import { getBaseUrl } from "@/lib/url";

const PAID_PLANS: ReadonlySet<string> = new Set(["pro", "scale"]);
const INTERVALS: ReadonlySet<string> = new Set(["monthly", "annual"]);

function parsePaidPlan(value: FormDataEntryValue | null): PaidPlan | null {
  return typeof value === "string" && PAID_PLANS.has(value)
    ? (value as PaidPlan)
    : null;
}

function parseInterval(
  value: FormDataEntryValue | null,
): BillingInterval | null {
  return typeof value === "string" && INTERVALS.has(value)
    ? (value as BillingInterval)
    : null;
}

/**
 * Start (or change) the venue's platform subscription via Stripe-hosted
 * Checkout. Creates the platform billing CUSTOMER on first use — server-side,
 * scoped to the venue via requireVenue(), never from client input — stamping
 * venueId in metadata so the billing webhook can resolve the venue. Card data
 * never touches our servers. The redirect stays OUTSIDE the try/catch (it throws
 * NEXT_REDIRECT, which a catch would swallow).
 *
 * This is the PLATFORM billing relationship, entirely separate from the venue's
 * Connect account (stripe_account_id) used for diner charges.
 */
export async function createBillingCheckout(formData: FormData): Promise<void> {
  const user = await requireUser();
  const venue = await requireVenue();
  const plan = parsePaidPlan(formData.get("plan"));
  const interval = parseInterval(formData.get("interval"));
  // Return-URL context only (Phase 3c). When the onboarding wizard initiates
  // Checkout it passes returnTo=wizard so success/cancel come back into the
  // wizard; the dashboard omits it and keeps its original URLs. Nothing else
  // about the Checkout/customer/trial setup changes.
  const isWizard = formData.get("returnTo") === "wizard";
  const successPath = isWizard
    ? "/onboarding/plan?checkout=success"
    : "/dashboard/billing?checkout=success";
  const cancelPath = isWizard
    ? "/onboarding/plan?checkout=cancel"
    : "/dashboard/billing?checkout=cancel";

  let destination: string;
  try {
    if (!plan || !interval) {
      throw new Error("Invalid plan or interval.");
    }
    const stripe = getStripe();

    let customerId = venue.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        name: venue.name,
        metadata: { venueId: venue.id },
      });
      customerId = customer.id;
      // Persist immediately so a later failure can't orphan the customer — the
      // next attempt reuses it instead of creating a duplicate.
      await db
        .update(venues)
        .set({ stripeCustomerId: customerId })
        .where(eq(venues.id, venue.id));
    }

    const baseUrl = await getBaseUrl();
    const priceId = await resolvePriceId(plan, interval);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      // 1-month trial with Scale-level access (the trial -> all-features mapping
      // lives in lib/billing/plans.ts). venueId on the subscription so its
      // webhook events resolve the venue even without the session.
      subscription_data: {
        trial_period_days: 30,
        metadata: { venueId: venue.id },
      },
      metadata: { venueId: venue.id, plan, interval },
      success_url: `${baseUrl}${successPath}`,
      cancel_url: `${baseUrl}${cancelPath}`,
    });

    if (!session.url) {
      throw new Error("Stripe did not return a Checkout URL.");
    }
    destination = session.url;
  } catch {
    destination = "/dashboard/billing?error=checkout";
  }

  redirect(destination);
}

/**
 * Send the owner to Stripe's hosted Billing Portal to manage or cancel their
 * subscription (no custom cancellation UI). Requires an existing customer. Auth
 * re-checked here — Server Functions are POST-able.
 */
export async function createBillingPortalSession(): Promise<void> {
  await requireUser();
  const venue = await requireVenue();

  let destination: string;
  try {
    if (!venue.stripeCustomerId) {
      throw new Error("No Stripe customer for this venue yet.");
    }
    const baseUrl = await getBaseUrl();
    const session = await getStripe().billingPortal.sessions.create({
      customer: venue.stripeCustomerId,
      return_url: `${baseUrl}/dashboard/billing`,
    });
    destination = session.url;
  } catch {
    destination = "/dashboard/billing?error=portal";
  }

  redirect(destination);
}
