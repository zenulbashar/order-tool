"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { venues } from "@/lib/db/schema";
import { requireUser, requireVenue } from "@/lib/tenant";

export type ServiceState = { error?: string };

/**
 * Onboarding Step 2 — record which fulfilment modes the venue offers.
 *
 * Writes the three service-style flags to the current venue and advances
 * onboarding_step to 3 (the menu-import step, built in 3b). These flags are
 * STORED now but NOT yet enforced on the diner storefront this phase. At least
 * one mode must be selected — a venue that offers nothing can't take orders.
 */
export async function saveServiceStyle(
  _prevState: ServiceState,
  formData: FormData,
): Promise<ServiceState> {
  await requireUser();
  const venue = await requireVenue();

  // Unchecked checkboxes are simply absent from the form data.
  const offersDineIn = formData.get("offersDineIn") === "on";
  const offersTakeaway = formData.get("offersTakeaway") === "on";
  const offersDelivery = formData.get("offersDelivery") === "on";

  if (!offersDineIn && !offersTakeaway && !offersDelivery) {
    return { error: "Choose at least one way customers can order." };
  }

  await db
    .update(venues)
    .set({
      offersDineIn,
      offersTakeaway,
      offersDelivery,
      onboardingStep: 3,
    })
    .where(eq(venues.id, venue.id));

  // Steps 3-5 are not built yet (3b/3c); return to the dashboard, where the
  // "finish setup" nudge keeps the wizard one click away.
  redirect("/dashboard");
}
