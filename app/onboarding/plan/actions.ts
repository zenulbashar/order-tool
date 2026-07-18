"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { venues } from "@/lib/db/schema";
import { requireUser, requireVenue } from "@/lib/tenant";

/**
 * Onboarding Step 5 — advance past plan selection to the go-live step.
 *
 * Reused for BOTH outcomes: the "Continue" after a successful Checkout (the
 * subscription + 30-day trial are already set up by Stripe, so we do NOT block
 * on the webhook confirming the plan) AND "I'll decide later" (the venue stays
 * on its default trial and can pick a plan from the Billing page before it ends).
 * Either way the plan step is done, so advance the resume pointer to 6 and route
 * forward. onboarding_completed_at is NOT touched here (that is the go-live step).
 */
export async function advanceToLiveStep(): Promise<void> {
  await requireUser();
  const venue = await requireVenue();

  await db
    .update(venues)
    .set({ onboardingStep: 6 })
    .where(eq(venues.id, venue.id));

  redirect("/onboarding/live");
}
