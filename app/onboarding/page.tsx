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
 * Steps 1-3 exist; Steps 4-5 are not built yet (3c), so a venue past Step 3
 * returns to the dashboard, where the persistent "finish setup" nudge keeps the
 * wizard one click away. This switch extends as later steps land. We never route
 * an EXISTING venue to /onboarding/details (that step creates a venue), so the
 * nudge can't spawn a duplicate location.
 */
export default async function OnboardingPage() {
  await requireUser();
  const venue = await getCurrentVenue();

  if (!venue) redirect("/onboarding/details");
  if (isOnboardingComplete(venue)) redirect("/dashboard");
  if (venue.onboardingStep <= 2) redirect("/onboarding/service");
  if (venue.onboardingStep === 3) redirect("/onboarding/menu");
  redirect("/dashboard");
}
