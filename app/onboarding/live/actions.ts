"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { venues } from "@/lib/db/schema";
import { requireUser, requireVenue } from "@/lib/tenant";

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
  await requireUser();
  const venue = await requireVenue();

  await db
    .update(venues)
    .set({ onboardingCompletedAt: new Date() })
    .where(eq(venues.id, venue.id));

  redirect("/dashboard");
}
