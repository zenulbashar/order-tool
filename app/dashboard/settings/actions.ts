"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { venues } from "@/lib/db/schema";
import { requireVenue } from "@/lib/tenant";
import {
  OPENING_DAYS,
  venueDetailsSchema,
  venueSettingsSchema,
} from "@/lib/validation";

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

/**
 * Assemble the opening-hours ranges from the per-day form fields. A day is
 * included only when it has BOTH an open and close time; a day left blank is
 * simply unpublished (closed days are omitted, which is what schema.org wants),
 * while a half-filled day is a clear error rather than silently dropped. Format
 * and open<close ordering are re-checked by venueDetailsSchema. Returns the raw
 * ranges (the schema turns an empty list into null so the JSON-LD omits hours).
 */
function readOpeningHours(
  formData: FormData,
):
  | { ok: true; value: { day: number; opens: string; closes: string }[] }
  | { ok: false; error: string } {
  const ranges: { day: number; opens: string; closes: string }[] = [];
  for (const { key, label, day } of OPENING_DAYS) {
    const opens = String(formData.get(`${key}Open`) ?? "").trim();
    const closes = String(formData.get(`${key}Close`) ?? "").trim();
    if (!opens && !closes) continue; // left blank = no published hours that day
    if (!opens || !closes) {
      return {
        ok: false,
        error: `Set both open and close times for ${label}, or leave both blank.`,
      };
    }
    ranges.push({ day, opens, closes });
  }
  return { ok: true, value: ranges };
}

/**
 * Update the current venue's business details — the address, phone, opening
 * hours, and geo that feed the storefront's search-listing JSON-LD. Security is
 * identical to updateVenueSettings: ownership comes from requireVenue() (never a
 * client-supplied id), the write is scoped WHERE id = venue.id, and only
 * whitelisted, validated columns are set (no mass assignment). Every field is
 * optional and empty input is stored as NULL, so nothing fabricated is saved.
 */
export async function updateVenueDetails(
  _prev: VenueSettingsState,
  formData: FormData,
): Promise<VenueSettingsState> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
  const venue = await requireVenue();

  const hours = readOpeningHours(formData);
  if (!hours.ok) {
    return { error: hours.error };
  }

  const parsed = venueDetailsSchema.safeParse({
    streetAddress: formData.get("streetAddress") ?? "",
    suburb: formData.get("suburb") ?? "",
    state: formData.get("state") ?? "",
    postcode: formData.get("postcode") ?? "",
    country: formData.get("country") ?? "",
    phone: formData.get("phone") ?? "",
    latitude: formData.get("latitude") ?? "",
    longitude: formData.get("longitude") ?? "",
    openingHours: hours.value,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  await db
    .update(venues)
    .set({
      streetAddress: parsed.data.streetAddress,
      suburb: parsed.data.suburb,
      state: parsed.data.state,
      postcode: parsed.data.postcode,
      country: parsed.data.country,
      phone: parsed.data.phone,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      openingHours: parsed.data.openingHours,
    })
    .where(eq(venues.id, venue.id));

  revalidatePath("/dashboard/settings");
  revalidatePath(`/${venue.slug}`);
  return { success: true };
}
