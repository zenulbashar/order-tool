"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { venues } from "@/lib/db/schema";
import { requireVenue } from "@/lib/tenant";
import { venueSettingsSchema } from "@/lib/validation";

export type VenueSettingsState = { error?: string; success?: boolean };

/**
 * Update the current venue's storefront theming. Ownership comes from the
 * session via requireVenue() (no client-supplied id), so the update is scoped
 * to the owner's own venue. Server Functions are POST-able, so auth is
 * re-checked here; the redirect stays outside any try/catch.
 */
export async function updateVenueSettings(
  _prev: VenueSettingsState,
  formData: FormData,
): Promise<VenueSettingsState> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
  const venue = await requireVenue();

  const parsed = venueSettingsSchema.safeParse({
    brandColor: formData.get("brandColor") ?? "",
    logoUrl: formData.get("logoUrl") ?? "",
    storefrontDescription: formData.get("storefrontDescription") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  await db
    .update(venues)
    .set({
      brandColor: parsed.data.brandColor,
      logoUrl: parsed.data.logoUrl,
      storefrontDescription: parsed.data.storefrontDescription,
    })
    .where(eq(venues.id, venue.id));

  revalidatePath("/dashboard/settings");
  // The storefront is force-dynamic, but clear its router cache entry too.
  revalidatePath(`/${venue.slug}`);
  return { success: true };
}
