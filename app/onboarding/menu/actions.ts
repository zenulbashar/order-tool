"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { venues } from "@/lib/db/schema";
import { requireUser, requireVenue } from "@/lib/tenant";

/**
 * Onboarding Step 3 — advance past the menu-import step.
 *
 * Reused for BOTH outcomes: the publish-success hook passed to ImportClient
 * (after the existing publishMenu has appended the menu) AND the "I'll add my
 * menu later" skip. Either way the menu step is done, so we advance the resume
 * pointer to Step 4 (Stations) and route forward into it. The actual menu write
 * stays entirely in the reused publishMenu action; this only moves the wizard
 * along. onboarding_completed_at is NOT touched here (that is the final step).
 */
export async function completeMenuStep(): Promise<void> {
  await requireUser();
  const venue = await requireVenue();

  await db
    .update(venues)
    .set({ onboardingStep: 4 })
    .where(eq(venues.id, venue.id));

  redirect("/onboarding/stations");
}
