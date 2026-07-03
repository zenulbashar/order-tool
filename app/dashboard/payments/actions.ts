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
