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
