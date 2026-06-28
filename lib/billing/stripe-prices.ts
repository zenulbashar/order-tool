import "server-only";

import { getStripe } from "@/lib/stripe";

import type { Plan } from "./plans";

/**
 * Stripe price configuration (Phase 2). The app knows only LOOKUP KEYS, never
 * amounts: prices (and the −20% annual discount) live in Stripe, so they can be
 * changed there without a deploy. The four Price objects already exist in Stripe
 * (test mode), each tagged with one of these lookup keys.
 *
 * Two directions:
 *   - forward  (checkout):  plan + interval -> lookup key -> Price ID, resolved
 *     against the Stripe API and cached (resolvePriceId).
 *   - backward (webhook):   a subscription's price.lookup_key -> plan tier, a
 *     pure map with no API call (planFromLookupKey).
 */

/** The plans that can actually be purchased (trial/free are not sold). */
export type PaidPlan = Extract<Plan, "pro" | "scale">;

export type BillingInterval = "monthly" | "annual";

/** plan + interval -> Stripe lookup key. The ONLY place keys are written. */
export const PLAN_PRICE_LOOKUP_KEYS: Record<
  PaidPlan,
  Record<BillingInterval, string>
> = {
  pro: { monthly: "pro_monthly", annual: "pro_annual" },
  scale: { monthly: "scale_monthly", annual: "scale_annual" },
};

/** Reverse map: lookup key -> plan tier, for the webhook to derive the tier. */
const LOOKUP_KEY_TO_PLAN: Record<string, PaidPlan> = {
  pro_monthly: "pro",
  pro_annual: "pro",
  scale_monthly: "scale",
  scale_annual: "scale",
};

/**
 * Resolve a subscription price's lookup key to its plan tier. Returns null for
 * an unknown key (e.g. a legacy/manually-created price) so the caller can decide
 * a safe fallback rather than crash. Pure — no Stripe call.
 */
export function planFromLookupKey(
  lookupKey: string | null | undefined,
): PaidPlan | null {
  if (!lookupKey) return null;
  return LOOKUP_KEY_TO_PLAN[lookupKey] ?? null;
}

/* -------------------------------------------------------------------------- */
/* Lookup key -> Price ID resolution, cached with a short TTL.                 */
/*                                                                            */
/* The cache keeps checkout from listing prices on every click, while the TTL */
/* preserves the "change the price in Stripe without a deploy" property: a     */
/* price swap (Stripe moves the lookup key to a new Price) propagates within   */
/* the TTL. Amounts are never cached here — only the key -> id mapping.        */
/* -------------------------------------------------------------------------- */
const PRICE_ID_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const priceIdCache = new Map<string, { priceId: string; expiresAt: number }>();

/**
 * Resolve a plan + interval to its live Stripe Price ID via its lookup key.
 * Throws when no active price carries the key (a misconfiguration worth failing
 * loudly on at checkout, never silently charging the wrong thing).
 */
export async function resolvePriceId(
  plan: PaidPlan,
  interval: BillingInterval,
): Promise<string> {
  const lookupKey = PLAN_PRICE_LOOKUP_KEYS[plan][interval];

  const cached = priceIdCache.get(lookupKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.priceId;
  }

  const prices = await getStripe().prices.list({
    lookup_keys: [lookupKey],
    active: true,
    limit: 1,
  });
  const priceId = prices.data[0]?.id;
  if (!priceId) {
    throw new Error(
      `No active Stripe price found for lookup key "${lookupKey}".`,
    );
  }

  priceIdCache.set(lookupKey, {
    priceId,
    expiresAt: Date.now() + PRICE_ID_CACHE_TTL_MS,
  });
  return priceId;
}
