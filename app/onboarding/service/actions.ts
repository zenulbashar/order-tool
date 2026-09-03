"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { venues } from "@/lib/db/schema";
import { requireWizardVenue } from "@/lib/tenant";

export type ServiceState = { error?: string };

/**
 * Onboarding Step 2 — record which fulfilment modes the venue offers.
 *
 * Writes the service-style flags to the current venue and advances
 * onboarding_step to 3 (the menu-import step, built in 3b). Only dine-in and
 * takeaway are selectable — the two modes order_type can represent. At least
 * one must be selected; a venue that offers nothing can't take orders.
 */
export async function saveServiceStyle(
  _prevState: ServiceState,
  formData: FormData,
): Promise<ServiceState> {
  const venue = await requireWizardVenue();

  // Unchecked checkboxes are simply absent from the form data.
  const offersDineIn = formData.get("offersDineIn") === "on";
  const offersTakeaway = formData.get("offersTakeaway") === "on";

  // Delivery is NOT read from the form: the ordering domain has no delivery
  // fulfilment (order_type is pickup | dine_in), so accepting it here would let
  // a merchant onboard onto a mode that can't take orders. Server Functions are
  // reachable via direct POST, so ignoring the field (not just hiding the
  // checkbox) is what makes this safe. Validation therefore requires one of the
  // two modes that actually exist.
  if (!offersDineIn && !offersTakeaway) {
    return { error: "Choose at least one way customers can order." };
  }

  await db
    .update(venues)
    .set({
      offersDineIn,
      offersTakeaway,
      // Pinned false until delivery ships — also self-heals any venue that
      // selected delivery back when the wizard offered it.
      offersDelivery: false,
      onboardingStep: 3,
    })
    .where(eq(venues.id, venue.id));

  // Forward to Step 3 (menu), like every other step. This used to send the
  // owner to the dashboard on the premise that later steps were unbuilt, which
  // ejected every new owner from the wizard at step 2 once they existed.
  redirect("/onboarding/menu");
}
