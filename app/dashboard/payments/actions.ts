"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { venues } from "@/lib/db/schema";
import { getStripe } from "@/lib/stripe";
import { requireUser, requireVenue } from "@/lib/tenant";
import { getBaseUrl } from "@/lib/url";

import { syncStripeAccountStatus } from "./queries";

/**
 * Start (or resume) Stripe Connect Express onboarding for the current venue.
 * Creates the connected account on first use — server-side, scoped to the
 * venue via requireVenue(), never from client input — then redirects the owner
 * to the Stripe-hosted onboarding flow via an Account Link. The redirect stays
 * OUTSIDE the try/catch (it throws NEXT_REDIRECT, which a catch would swallow).
 */
export async function connectStripe(): Promise<void> {
  const user = await requireUser();
  const venue = await requireVenue();

  let destination: string;
  try {
    const stripe = getStripe();

    let accountId = venue.stripeAccountId;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "AU",
        email: user.email ?? undefined,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_profile: { name: venue.name },
        metadata: { venueId: venue.id },
      });
      accountId = account.id;
      // Persist immediately so a later failure can't orphan the account — the
      // next attempt reuses it instead of creating a duplicate.
      await db
        .update(venues)
        .set({ stripeAccountId: accountId })
        .where(eq(venues.id, venue.id));
    }

    const baseUrl = await getBaseUrl();
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${baseUrl}/dashboard/payments?onboarding=refresh`,
      return_url: `${baseUrl}/dashboard/payments?onboarding=return`,
      type: "account_onboarding",
    });
    destination = accountLink.url;
  } catch {
    destination = "/dashboard/payments?error=connect";
  }

  redirect(destination);
}

/**
 * Pull the latest account status from Stripe on demand (the "Refresh status"
 * button). Auth re-checked here — Server Functions are POST-able.
 */
export async function refreshStripeStatus(): Promise<void> {
  await requireUser();
  const venue = await requireVenue();
  if (venue.stripeAccountId) {
    await syncStripeAccountStatus(venue.id, venue.stripeAccountId);
  }
  revalidatePath("/dashboard/payments");
}

/**
 * Toggle pay-by-bank (PayTo) for this venue. Turning it ON requests the
 * `payto_payments` capability on the venue's Stripe connected account; once
 * Stripe activates it (PayTo is gated: the PLATFORM must have PayTo access +
 * identity verification, and the account may need extra info), PayTo appears
 * automatically in the existing Payment Element via automatic_payment_methods
 * — placeOrder, the confirm path, and the webhook are all UNCHANGED.
 *
 * The capability request is best-effort: if the platform doesn't yet have
 * PayTo enabled, Stripe rejects the request — we still record the owner's
 * intent (payto_enabled) and the Payments page shows a "pending Stripe
 * verification" note, exactly how the Square connector shipped before its
 * commercial enablement. This never touches the money path.
 */
export async function setPayToEnabled(formData: FormData): Promise<void> {
  await requireUser();
  const venue = await requireVenue();
  const enable = formData.get("enable") === "on";

  // PayTo lives on the connected account; only meaningful once charges work.
  if (venue.stripeAccountId && venue.stripeChargesEnabled) {
    try {
      await getStripe().accounts.update(venue.stripeAccountId, {
        capabilities: { payto_payments: { requested: enable } },
      });
    } catch {
      // Platform PayTo access not live yet (or the capability can't be
      // released) — record intent anyway; the page surfaces the pending state.
    }
  }

  await db
    .update(venues)
    .set({ paytoEnabled: enable })
    .where(eq(venues.id, venue.id));

  revalidatePath("/dashboard/payments");
  revalidatePath(`/${venue.slug}`);
}

/**
 * Configure the pay-by-bank saving passed to customers who choose PayTo
 * (Track B · 3b-ii). off = none; flat = a fixed dollar amount → stored cents;
 * percent = a whole percentage of subtotal. A zero/invalid value normalises to
 * off. This is owner intent only — the diner-side discount is always
 * server-recomputed at pay time (applyBankDiscount) and never a card surcharge.
 */
export async function setPaytoDiscount(formData: FormData): Promise<void> {
  await requireUser();
  const venue = await requireVenue();

  const modeRaw = formData.get("mode");
  const mode = modeRaw === "flat" || modeRaw === "percent" ? modeRaw : "off";
  const valueRaw = String(formData.get("value") ?? "").trim();

  let value = 0;
  if (mode === "flat") {
    // Entered in dollars (e.g. 0.30) → integer cents.
    const dollars = Number(valueRaw);
    value =
      Number.isFinite(dollars) && dollars > 0 ? Math.round(dollars * 100) : 0;
  } else if (mode === "percent") {
    // Whole percent, 1–100.
    const pct = Number(valueRaw);
    value = Number.isInteger(pct) && pct >= 1 && pct <= 100 ? pct : 0;
  }
  const finalMode = value > 0 ? mode : "off";

  await db
    .update(venues)
    .set({ paytoDiscountMode: finalMode, paytoDiscountValue: value })
    .where(eq(venues.id, venue.id));

  revalidatePath("/dashboard/payments");
  revalidatePath(`/${venue.slug}`);
}

/** Point-values the redemption ratio may take (cents per point). Constrained to
 *  a preset set so the math stays exact (discount = points × cents) and the
 *  owner picks a familiar ratio: 1¢=100pts/$1, 2¢=50, 5¢=20, 10¢=10. */
const LOYALTY_REDEEM_VALUES = new Set([1, 2, 5, 10]);

/**
 * Configure customer loyalty/points for this venue (PR1 — money-inert). Owner
 * intent only: enabling changes no existing charge. Earning happens off the
 * confirmed-order webhook; redemption (a later build) is server-recomputed at
 * pay time through the same discount seam as promos — never a surcharge. All
 * values are re-validated + clamped here; the checkbox follows the house
 * convention (present ⇒ on). Disabling leaves the config + ledger intact so
 * re-enabling resumes where it left off.
 */
export async function setLoyaltyConfig(formData: FormData): Promise<void> {
  await requireUser();
  const venue = await requireVenue();

  const enabled = formData.get("enabled") === "on";

  const earnRaw = Number(formData.get("earnRatePerDollar"));
  const earnRatePerDollar =
    Number.isInteger(earnRaw) && earnRaw >= 1 && earnRaw <= 100 ? earnRaw : 1;

  const redeemRaw = Number(formData.get("redeemValueCents"));
  const redeemValueCents = LOYALTY_REDEEM_VALUES.has(redeemRaw) ? redeemRaw : 1;

  const minRaw = Number(formData.get("minRedeemPoints"));
  const minRedeemPoints =
    Number.isInteger(minRaw) && minRaw >= 0 && minRaw <= 100000 ? minRaw : 0;

  await db
    .update(venues)
    .set({
      loyaltyEnabled: enabled,
      loyaltyEarnRatePerDollar: earnRatePerDollar,
      loyaltyRedeemValueCents: redeemValueCents,
      loyaltyMinRedeemPoints: minRedeemPoints,
    })
    .where(eq(venues.id, venue.id));

  revalidatePath("/dashboard/payments");
  revalidatePath(`/${venue.slug}`);
}
