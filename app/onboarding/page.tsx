import { redirect } from "next/navigation";

import { getCurrentVenue, isOnboardingComplete, requireUser } from "@/lib/tenant";

// Reads live venue state to decide where to resume; never prerendered.
export const dynamic = "force-dynamic";

/**
 * Onboarding resume router (Phase 3a). Not a screen — it sends the owner to the
 * right step:
 *  - no venue yet           -> Step 1 (which creates the venue)
 *  - onboarding complete     -> dashboard (nothing to resume)
 *  - otherwise               -> the saved step
 *
 * All six steps exist. A venue past the last step it has reached resumes there;
 * once onboarding_completed_at is set (final step), it short-circuits to the
 * dashboard. We never route an EXISTING venue to /onboarding/details (that step
 * creates a venue), so the nudge can't spawn a duplicate location.
 */
export default async function OnboardingPage() {
  await requireUser();
  const venue = await getCurrentVenue();

  if (!venue) redirect("/onboarding/details");
  if (isOnboardingComplete(venue)) redirect("/dashboard");
  if (venue.onboardingStep <= 2) redirect("/onboarding/service");
  if (venue.onboardingStep === 3) redirect("/onboarding/menu");
  if (venue.onboardingStep === 4) redirect("/onboarding/stations");
  if (venue.onboardingStep === 5) redirect("/onboarding/plan");
  if (venue.onboardingStep === 6) redirect("/onboarding/live");
  redirect("/dashboard");
}
