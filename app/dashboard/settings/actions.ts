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
  hostedImageUrlSchema,
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
      // "auto" posts empty → stored NULL (the diner keeps the shared ink);
      // "custom" posts the picked hex.
      textColor:
        formData.get("textColorMode") === "custom"
          ? (formData.get("textColor") ?? "")
          : "",
      announcement: formData.get("announcement") ?? "",
      instagramUrl: formData.get("instagramUrl") ?? "",
      storefrontDescription: formData.get("storefrontDescription") ?? "",
    });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  await db
    .update(venues)
    .set({
      brandColor: parsed.data.brandColor,
      brandTextColor: parsed.data.textColor,
      announcement: parsed.data.announcement,
      instagramUrl: parsed.data.instagramUrl,
      storefrontDescription: parsed.data.storefrontDescription,
    })
    .where(eq(venues.id, venue.id));

  revalidatePath("/dashboard/settings");
  // The storefront is force-dynamic, but clear its router cache entry too.
  revalidatePath(`/${venue.slug}`);
  return { success: true };
}

/**
 * Save the venue's GST/sales-tax config. INCLUSIVE model: menu prices are
 * unchanged; this only controls whether the tax portion is shown on receipts and
 * at what rate. Ownership is the session venue (no client id); the rate is stored
 * in basis points (percent × 100). Never touches any order or the money path.
 */
export async function saveTaxSettings(
  _prev: VenueSettingsState,
  formData: FormData,
): Promise<VenueSettingsState> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
  const venue = await requireVenue();

  const enabled = formData.get("taxEnabled") === "on";
  const label = String(formData.get("taxLabel") ?? "").trim() || "GST";
  const rawRate = String(formData.get("taxRatePercent") ?? "").trim();
  const rate = rawRate === "" ? 0 : Number(rawRate);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    return { error: "Tax rate must be between 0 and 100%." };
  }
  if (label.length > 20) {
    return { error: "Tax label must be 20 characters or fewer." };
  }

  await db
    .update(venues)
    .set({
      taxEnabled: enabled,
      taxRateBps: Math.round(rate * 100), // percent → basis points (10 → 1000)
      taxLabel: label,
    })
    .where(eq(venues.id, venue.id));

  revalidatePath("/dashboard/settings");
  revalidatePath(`/${venue.slug}`);
  return { success: true };
}

/**
 * Toggle new-order push notifications for the current venue (quick-win #5).
 * Ownership from the session (no client id). Only gates the send path in
 * lib/push.ts — never fabricates a push (still needs FCM + a registered device).
 */
export async function setPushNewOrders(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
  const venue = await requireVenue();
  const enabled = formData.get("enable") === "on";
  await db
    .update(venues)
    .set({ pushNewOrders: enabled })
    .where(eq(venues.id, venue.id));
  revalidatePath("/dashboard/settings");
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

/**
 * Best-effort dominant-colour extraction from an uploaded logo (sharp's
 * 4096-bin histogram dominant). Returns a hex, or null when extraction fails or
 * the dominant is too close to white/black to work as a brand accent (a logo on
 * a white background would otherwise "brand" the venue white). Never throws.
 */
async function deriveBrandColorFromLogo(
  buffer: Buffer,
): Promise<string | null> {
  try {
    const sharp = (await import("sharp")).default;
    const { dominant } = await sharp(buffer).stats();
    const { r, g, b } = dominant;
    // Relative-luminance guard: skip near-white / near-black dominants.
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    if (lum > 0.88 || lum < 0.06) return null;
    const hex = (v: number) => v.toString(16).padStart(2, "0");
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  } catch {
    return null;
  }
}

// The venues.brand_color schema default — auto-derivation from the logo applies
// ONLY while the venue is still on this untouched default, so an owner's chosen
// colour is never overwritten by an upload.
const BRAND_COLOR_DEFAULT = "#111827";

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

  const buffer = Buffer.from(await file.arrayBuffer());
  let publicUrl: string;
  try {
    publicUrl = await uploadToR2(key, buffer, file.type);
  } catch {
    // Upload failed (network, or R2 not configured) — leave the DB untouched.
    return { error: "Couldn't upload the logo right now. Please try again." };
  }

  // Auto-brand from the logo (two-colour theming): ONLY while brand_color is
  // still the untouched schema default — a colour the owner chose is never
  // overwritten. Best-effort; extraction failure changes nothing.
  const derivedBrand =
    venue.brandColor === BRAND_COLOR_DEFAULT
      ? await deriveBrandColorFromLogo(buffer)
      : null;

  await db
    .update(venues)
    .set({
      logoUrl: publicUrl,
      ...(derivedBrand ? { brandColor: derivedBrand } : {}),
    })
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

/* ----------------------- Storefront brand imagery ------------------------- */
/* Two owner-uploaded images: the storefront COVER (hero band) and the diner    */
/* BACKGROUND (fills the side gutters behind the centered column on wide         */
/* screens). Same discipline and security as the logo above — owned by these     */
/* dedicated actions (never the theme save), uploaded server-side to R2, type +  */
/* size re-validated here, ownership scoped WHERE id = venue.id, old R2 objects   */
/* cleaned up best-effort. Photographic, so a slightly larger 5MB cap than the    */
/* logo's 2MB (well under serverActions.bodySizeLimit).                          */

const IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5MB
// cover/cover2/cover3 are the storefront hero rotation slots; "background" is
// retired from the UI but kept here so its actions stay valid.
type ImagerySlot = "cover" | "cover2" | "cover3" | "background";

const SLOT_COLUMN = {
  cover: venues.coverUrl,
  cover2: venues.coverUrl2,
  cover3: venues.coverUrl3,
  background: venues.backgroundUrl,
} as const;

/** Read the venue's current URL for one imagery slot, or null. */
async function currentImageUrl(
  venueId: string,
  slot: ImagerySlot,
): Promise<string | null> {
  const [row] = await db
    .select({ url: SLOT_COLUMN[slot] })
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1);
  return row?.url ?? null;
}

/** Set one imagery slot's column (explicit branch keeps the update type-safe). */
function setImageColumn(venueId: string, slot: ImagerySlot, url: string | null) {
  const values =
    slot === "cover"
      ? { coverUrl: url }
      : slot === "cover2"
        ? { coverUrl2: url }
        : slot === "cover3"
          ? { coverUrl3: url }
          : { backgroundUrl: url };
  return db.update(venues).set(values).where(eq(venues.id, venueId));
}

/** Upload a file to one imagery slot. Server-side validation is the real gate. */
async function uploadVenueImage(
  slot: ImagerySlot,
  formData: FormData,
): Promise<LogoState> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
  const venue = await requireVenue();

  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an image to upload." };
  }
  if (file.size > IMAGE_MAX_BYTES) {
    return { error: "Image must be 5MB or smaller." };
  }
  const ext = LOGO_TYPE_EXT[file.type];
  if (!ext) {
    return { error: "Image must be a JPEG, PNG, or WebP image." };
  }

  const previousUrl = await currentImageUrl(venue.id, slot);
  const key = `venues/${venue.id}/${slot}/${crypto.randomUUID()}.${ext}`;

  let publicUrl: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    publicUrl = await uploadToR2(key, buffer, file.type);
  } catch {
    return { error: "Couldn't upload the image right now. Please try again." };
  }

  await setImageColumn(venue.id, slot, publicUrl);
  await bestEffortDeleteLogo(previousUrl);

  revalidatePath("/dashboard/settings");
  revalidatePath(`/${venue.slug}`);
  return {};
}

/** Point one imagery slot at a pasted hosted URL (the pre-upload path). */
async function setVenueImageUrl(
  slot: ImagerySlot,
  formData: FormData,
): Promise<LogoState> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
  const venue = await requireVenue();

  const parsed = hostedImageUrlSchema.safeParse(formData.get("imageUrl") ?? "");
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Enter a valid URL." };
  }

  const previousUrl = await currentImageUrl(venue.id, slot);
  await setImageColumn(venue.id, slot, parsed.data);

  if (previousUrl && previousUrl !== parsed.data) {
    await bestEffortDeleteLogo(previousUrl);
  }

  revalidatePath("/dashboard/settings");
  revalidatePath(`/${venue.slug}`);
  return {};
}

/** Clear one imagery slot (reverts that surface to its default look). */
async function removeVenueImage(slot: ImagerySlot): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
  const venue = await requireVenue();

  const previousUrl = await currentImageUrl(venue.id, slot);
  await setImageColumn(venue.id, slot, null);

  await bestEffortDeleteLogo(previousUrl);

  revalidatePath("/dashboard/settings");
  revalidatePath(`/${venue.slug}`);
}

// Thin per-slot server actions the imagery control binds directly. Each keeps
// the (prev, formData) shape useActionState expects; remove is a plain action.
export async function uploadVenueCover(
  _prev: LogoState,
  formData: FormData,
): Promise<LogoState> {
  return uploadVenueImage("cover", formData);
}
export async function setVenueCoverUrl(
  _prev: LogoState,
  formData: FormData,
): Promise<LogoState> {
  return setVenueImageUrl("cover", formData);
}
export async function removeVenueCover(): Promise<void> {
  return removeVenueImage("cover");
}
export async function uploadVenueCover2(
  _prev: LogoState,
  formData: FormData,
): Promise<LogoState> {
  return uploadVenueImage("cover2", formData);
}
export async function setVenueCover2Url(
  _prev: LogoState,
  formData: FormData,
): Promise<LogoState> {
  return setVenueImageUrl("cover2", formData);
}
export async function removeVenueCover2(): Promise<void> {
  return removeVenueImage("cover2");
}
export async function uploadVenueCover3(
  _prev: LogoState,
  formData: FormData,
): Promise<LogoState> {
  return uploadVenueImage("cover3", formData);
}
export async function setVenueCover3Url(
  _prev: LogoState,
  formData: FormData,
): Promise<LogoState> {
  return setVenueImageUrl("cover3", formData);
}
export async function removeVenueCover3(): Promise<void> {
  return removeVenueImage("cover3");
}
export async function uploadVenueBackground(
  _prev: LogoState,
  formData: FormData,
): Promise<LogoState> {
  return uploadVenueImage("background", formData);
}
export async function setVenueBackgroundUrl(
  _prev: LogoState,
  formData: FormData,
): Promise<LogoState> {
  return setVenueImageUrl("background", formData);
}
export async function removeVenueBackground(): Promise<void> {
  return removeVenueImage("background");
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
