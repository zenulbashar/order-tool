"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { revalidateStorefront } from "@/lib/storefront-cache";
import { venues } from "@/lib/db/schema";
import { requireWizardVenue } from "@/lib/tenant";

/**
 * Onboarding final step (go live) — finish onboarding.
 *
 * Flips onboarding_completed_at to now(): the SINGLE live-ready signal. After
 * this, isOnboardingComplete(venue) is true, so the placeOrder gate passes, the
 * storefront drops its "not taking orders yet" state, and the dashboard nudge
 * disappears. An explicit action (not a render-time write) so leaving the step
 * without finishing safely resumes here. Idempotent in effect — re-running just
 * re-stamps a venue that is already live.
 */
export async function finishOnboarding(): Promise<void> {
  // Going live is what makes placeOrder start accepting real money, so it is a
  // settings capability — not something venue membership alone confers. An
  // already-live venue short-circuits to the dashboard, which is where this
  // redirected anyway, so the user-visible outcome is unchanged.
  const venue = await requireWizardVenue();

  await db
    .update(venues)
    .set({ onboardingCompletedAt: new Date() })
    .where(eq(venues.id, venue.id));

  // The storefront caches the venue for an hour; going live must not wait
  // for that to lapse (the hero's "Open" signal and the not-yet-live notice
  // both read the cached row).
  revalidateStorefront(venue);

  redirect("/dashboard");
}
