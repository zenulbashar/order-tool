import "server-only";

import { unstable_cache } from "next/cache";

import { getStripe } from "@/lib/stripe";

import {
  PLAN_PRICE_LOOKUP_KEYS,
  type BillingInterval,
  type PaidPlan,
} from "./stripe-prices";

/**
 * PUBLIC (anonymous) plan pricing for the marketing landing page.
 *
 * The app deliberately stores no plan amounts — prices live in Stripe so they can
 * change without a deploy (see stripe-prices.ts). The landing page previously
 * hard-coded a price and two tier names that the billing system cannot sell,
 * which drifted the moment anyone touched Stripe. This module closes that gap by
 * reading the amounts back from the SAME lookup keys checkout resolves, so the
 * page and the charge can never disagree.
 *
 * Three properties this must hold, because it renders on an anonymous, cached,
 * database-free public route:
 *
 *  1. It NEVER throws. Every failure — no key, no Stripe, network error, a
 *     missing Price — degrades to "no amount", and the caller renders the tier
 *     without a number rather than a wrong one. `getStripe()` throws when
 *     STRIPE_SECRET_KEY is unset, so that case is checked BEFORE constructing it.
 *  2. It makes at most ONE Stripe call per hour (unstable_cache), not one per
 *     visitor, mirroring lib/shop/feed.ts.
 *  3. It reads only ACTIVE prices, and only the four plan keys. The Roster add-on
 *     is deliberately excluded: it is not a plan a visitor can buy.
 */

/** A tier's public amounts, in the smallest currency unit. */
export type PublicPlanPrice = {
  monthlyCents: number;
  /** null when no active annual Price carries the key. */
  annualCents: number | null;
  /** ISO 4217, upper-cased (e.g. "AUD"). */
  currency: string;
};

/** Tier -> amounts. A tier is ABSENT when its monthly price can't be resolved. */
export type PublicPricing = Partial<Record<PaidPlan, PublicPlanPrice>>;

/** The tiers a visitor can actually buy, in display order. */
export const PUBLIC_PLANS: readonly PaidPlan[] = ["pro", "scale"] as const;

const PLAN_LOOKUP_KEYS: string[] = PUBLIC_PLANS.flatMap((plan) =>
  (["monthly", "annual"] as BillingInterval[]).map(
    (interval) => PLAN_PRICE_LOOKUP_KEYS[plan][interval],
  ),
);

async function fetchPublicPricing(): Promise<PublicPricing> {
  // Checked before getStripe(), which throws on a missing key. An unconfigured
  // deployment must render the landing page, not 500 it.
  if (!process.env.STRIPE_SECRET_KEY) return {};

  try {
    const prices = await getStripe().prices.list({
      lookup_keys: PLAN_LOOKUP_KEYS,
      active: true,
      limit: PLAN_LOOKUP_KEYS.length,
    });

    const byLookupKey = new Map(
      prices.data
        .filter((price) => price.lookup_key)
        .map((price) => [price.lookup_key as string, price]),
    );

    const pricing: PublicPricing = {};
    for (const plan of PUBLIC_PLANS) {
      const monthly = byLookupKey.get(PLAN_PRICE_LOOKUP_KEYS[plan].monthly);
      const annual = byLookupKey.get(PLAN_PRICE_LOOKUP_KEYS[plan].annual);

      // The monthly amount is what the card leads with, so a tier with no
      // resolvable monthly price shows no number at all rather than a partial one.
      if (typeof monthly?.unit_amount !== "number") continue;

      pricing[plan] = {
        monthlyCents: monthly.unit_amount,
        annualCents:
          typeof annual?.unit_amount === "number" ? annual.unit_amount : null,
        currency: (monthly.currency || "aud").toUpperCase(),
      };
    }
    return pricing;
  } catch (error) {
    // Deliberately swallowed: a marketing page must not fail on a billing
    // dependency. Logged so a misconfiguration is still discoverable.
    console.warn(
      "[public-pricing] could not resolve plan prices from Stripe; rendering without amounts:",
      error instanceof Error ? error.message : error,
    );
    return {};
  }
}

/**
 * Cached public pricing. One Stripe read per hour per deployment; a price change
 * in Stripe propagates within that TTL with no deploy, which is the whole point
 * of keeping amounts out of the code.
 */
export const getPublicPricing = unstable_cache(
  fetchPublicPricing,
  ["public-plan-pricing-v1"],
  { revalidate: 3600 },
);

/**
 * Whole-dollar display for a marketing headline ("$89"). Cents are shown only
 * when a price actually has them, so a round price never reads "$89.00".
 */
export function formatPlanAmount(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/**
 * The annual saving as whole percent, or null when there is no annual price or
 * it is not actually cheaper. Derived rather than asserted so the badge cannot
 * claim a discount Stripe does not give.
 */
export function annualSavingPercent(price: PublicPlanPrice): number | null {
  if (price.annualCents === null || price.monthlyCents <= 0) return null;
  const yearlyAtMonthlyRate = price.monthlyCents * 12;
  if (price.annualCents >= yearlyAtMonthlyRate) return null;
  const saving =
    ((yearlyAtMonthlyRate - price.annualCents) / yearlyAtMonthlyRate) * 100;
  return Math.round(saving);
}
