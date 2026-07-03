import "server-only";

import type Stripe from "stripe";

import { getStripe } from "@/lib/stripe";

import {
  type BillingInterval,
  isRosterLookupKey,
  planFromLookupKey,
  ROSTER_PRICE_LOOKUP_KEYS,
} from "./stripe-prices";

/**
 * Read-only billing overview for the consolidated billing page (Track C):
 * the live subscription rendered as line items (plan + Roster add-on), a single
 * total, the next charge date, and recent invoices — all from the platform
 * Stripe account (separate from the venue's Connect account). Owner-only, low
 * traffic. Every field is REAL Stripe data; nothing is fabricated. Callers wrap
 * this so a Stripe hiccup falls back to the minimal billing UI.
 */

export type BillingLine = {
  key: string;
  label: string;
  description: string;
  amountCents: number;
  isRoster: boolean;
};

export type BillingInvoice = {
  id: string;
  date: Date;
  amountCents: number;
  status: string;
  url: string | null;
};

export type BillingOverview = {
  interval: "monthly" | "annual";
  lines: BillingLine[];
  totalCents: number;
  /** Monthly-equivalent of the total (total for annual ÷ 12), for display. */
  perMonthCents: number;
  nextChargeAt: Date | null;
  rosterPresent: boolean;
  invoices: BillingInvoice[];
};

const PLAN_LINE_LABELS: Record<string, string> = {
  pro: "Prompt2Eat · Pro plan",
  scale: "Prompt2Eat · Scale plan",
};

/** Where Stripe puts the current period end varies by API version — try both. */
function periodEnd(subscription: Stripe.Subscription): Date | null {
  const subLevel = (subscription as { current_period_end?: number })
    .current_period_end;
  const itemLevel = subscription.items.data[0]?.current_period_end;
  const seconds = subLevel ?? itemLevel;
  return seconds ? new Date(seconds * 1000) : null;
}

export async function getBillingOverview(
  subscriptionId: string,
  customerId: string,
): Promise<BillingOverview | null> {
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  const lines: BillingLine[] = [];
  let totalCents = 0;
  let interval: "monthly" | "annual" = "monthly";
  let rosterPresent = false;

  for (const item of subscription.items.data) {
    const price = item.price;
    const amount = (price.unit_amount ?? 0) * (item.quantity ?? 1);
    totalCents += amount;
    if (price.recurring?.interval === "year") interval = "annual";

    const lookupKey = price.lookup_key;
    const planTier = planFromLookupKey(lookupKey);
    const roster = isRosterLookupKey(lookupKey);
    if (roster) rosterPresent = true;

    lines.push({
      key: item.id,
      label: roster
        ? "Roster"
        : planTier
          ? PLAN_LINE_LABELS[planTier]
          : "Subscription",
      description: roster
        ? "Rostering & wage costs · by Zale"
        : planTier
          ? "Online ordering, AI toolkit, kitchen & tables"
          : "",
      amountCents: amount,
      isRoster: roster,
    });
  }

  // Recent invoices (real). Best-effort — an empty list is fine.
  let invoices: BillingInvoice[] = [];
  try {
    const list = await stripe.invoices.list({ customer: customerId, limit: 6 });
    invoices = list.data.map((invoice) => ({
      id: invoice.id ?? invoice.number ?? "",
      date: new Date((invoice.created ?? 0) * 1000),
      amountCents: invoice.amount_paid || invoice.amount_due || invoice.total,
      status: invoice.status ?? "open",
      url: invoice.hosted_invoice_url ?? invoice.invoice_pdf ?? null,
    }));
  } catch {
    invoices = [];
  }

  return {
    interval,
    lines,
    totalCents,
    perMonthCents: interval === "annual" ? Math.round(totalCents / 12) : totalCents,
    nextChargeAt: periodEnd(subscription),
    rosterPresent,
    invoices,
  };
}

/**
 * The Roster add-on's price for an interval, for the "Add Roster · $X/mo" CTA.
 * Returns null when the price isn't configured yet (Stripe has no active price
 * for the lookup key) so the page can show a calm "being set up" state instead
 * of a button that errors on click.
 */
export async function getRosterAddonPriceCents(
  interval: BillingInterval,
): Promise<number | null> {
  try {
    const prices = await getStripe().prices.list({
      lookup_keys: [ROSTER_PRICE_LOOKUP_KEYS[interval]],
      active: true,
      limit: 1,
    });
    return prices.data[0]?.unit_amount ?? null;
  } catch {
    return null;
  }
}
