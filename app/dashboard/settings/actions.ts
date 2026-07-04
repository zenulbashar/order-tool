"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { venues } from "@/lib/db/schema";
import {
  deleteFromR2,
  r2KeyFromPublicUrl,
  uploadToR2,
} from "@/lib/r2";
import { requireVenue } from "@/lib/tenant";
import {
  logoUrlSchema,
  OPENING_DAYS,
  venueDetailsSchema,
  venueSettingsSchema,
} from "@/lib/validation";

export type VenueSettingsState = { error?: string; success?: boolean };
export type LogoState = { error?: string };

/**
 * Update the current venue's storefront theming. Ownership comes from the
 * session via requireVenue() (no client-supplied id), so the update is scoped
 * to the owner's own venue. Server Functions are POST-able, so auth is
 * re-checked here; the redirect stays outside any try/catch.
 *
 * logo_url is DELIBERATELY not in this set — the logo is owned by the dedicated
 * upload/URL/remove actions below (same discipline as menu_items.image_url),
 * so a theme save can never clobber a just-uploaded logo.
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

  const parsed = venueSettingsSchema
    .omit({ logoUrl: true })
    .safeParse({
      brandColor: formData.get("brandColor") ?? "",
      storefrontDescription: formData.get("storefrontDescription") ?? "",
    });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  await db
    .update(venues)
    .set({
      brandColor: parsed.data.brandColor,
      storefrontDescription: parsed.data.storefrontDescription,
    })
    .where(eq(venues.id, venue.id));

  revalidatePath("/dashboard/settings");
  // The storefront is force-dynamic, but clear its router cache entry too.
  revalidatePath(`/${venue.slug}`);
  return { success: true };
}

/* --------------------------------- Logo ----------------------------------- */
/* The venue logo is owned by these three actions (upload a file, paste a URL,  */
/* or remove) — never by the theme save above — so the two can't race. Uploads  */
/* go server-side to R2 (never browser->R2); type + size are re-validated here   */
/* as the real gate. Ownership is the session venue (no client-supplied id), so  */
/* every write is scoped WHERE id = venue.id. Old R2 objects are cleaned up      */
/* best-effort; a manually-pasted URL we don't manage is left alone.            */

const LOGO_MAX_BYTES = 2 * 1024 * 1024; // 2MB
const LOGO_TYPE_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Read the venue's current logo URL, or null. */
async function currentLogoUrl(venueId: string): Promise<string | null> {
  const [row] = await db
    .select({ logoUrl: venues.logoUrl })
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1);
  return row?.logoUrl ?? null;
}

/** Best-effort delete of an R2 object behind a stored public URL. Never throws. */
async function bestEffortDeleteLogo(url: string | null): Promise<void> {
  if (!url) return;
  const key = r2KeyFromPublicUrl(url);
  if (!key) return; // not an object we manage (e.g. a pasted third-party URL)
  try {
    await deleteFromR2(key);
  } catch {
    // Cleanup is best-effort: a leftover object is harmless and must never
    // fail the owner's request.
  }
}

export async function uploadVenueLogo(
  _prev: LogoState,
  formData: FormData,
): Promise<LogoState> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
  const venue = await requireVenue();

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an image to upload." };
  }
  // Server-side validation is the real gate (independent of any client check).
  if (file.size > LOGO_MAX_BYTES) {
    return { error: "Logo must be 2MB or smaller." };
  }
  const ext = LOGO_TYPE_EXT[file.type];
  if (!ext) {
    return { error: "Logo must be a JPEG, PNG, or WebP image." };
  }

  const previousUrl = await currentLogoUrl(venue.id);
  const key = `venues/${venue.id}/logo/${crypto.randomUUID()}.${ext}`;

  let publicUrl: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    publicUrl = await uploadToR2(key, buffer, file.type);
  } catch {
    // Upload failed (network, or R2 not configured) — leave the DB untouched.
    return { error: "Couldn't upload the logo right now. Please try again." };
  }

  await db
    .update(venues)
    .set({ logoUrl: publicUrl })
    .where(eq(venues.id, venue.id));

  await bestEffortDeleteLogo(previousUrl);

  revalidatePath("/dashboard/settings");
  revalidatePath(`/${venue.slug}`);
  return {};
}

export async function setVenueLogoUrl(
  _prev: LogoState,
  formData: FormData,
): Promise<LogoState> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
  const venue = await requireVenue();

  const parsed = logoUrlSchema.safeParse(formData.get("logoUrl") ?? "");
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Enter a valid URL." };
  }

  const previousUrl = await currentLogoUrl(venue.id);
  await db
    .update(venues)
    .set({ logoUrl: parsed.data })
    .where(eq(venues.id, venue.id));

  // If a pasted URL replaced an object we uploaded, clean the old one up.
  if (previousUrl && previousUrl !== parsed.data) {
    await bestEffortDeleteLogo(previousUrl);
  }

  revalidatePath("/dashboard/settings");
  revalidatePath(`/${venue.slug}`);
  return {};
}

export async function removeVenueLogo(): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
  const venue = await requireVenue();

  const previousUrl = await currentLogoUrl(venue.id);
  await db
    .update(venues)
    .set({ logoUrl: null })
    .where(eq(venues.id, venue.id));

  await bestEffortDeleteLogo(previousUrl);

  revalidatePath("/dashboard/settings");
  revalidatePath(`/${venue.slug}`);
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
    schedulingLeadMinutes: formData.get("schedulingLeadMinutes") ?? "",
    schedulingMaxDaysAhead: formData.get("schedulingMaxDaysAhead") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  // Checkbox (not part of venueDetailsSchema): the explicit per-venue opt-in for
  // scheduled pickup. Read directly, like the menu's boolean toggles.
  const schedulingEnabled = formData.get("schedulingEnabled") === "on";

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
      schedulingLeadMinutes: parsed.data.schedulingLeadMinutes,
      schedulingMaxDaysAhead: parsed.data.schedulingMaxDaysAhead,
      schedulingEnabled,
    })
    .where(eq(venues.id, venue.id));

  revalidatePath("/dashboard/settings");
  revalidatePath(`/${venue.slug}`);
  return { success: true };
}
