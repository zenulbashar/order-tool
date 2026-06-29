"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { venueMembers, venues, venueType } from "@/lib/db/schema";
import { setSelectedVenueCookie } from "@/lib/tenant";
import { isReservedSlug, slugSchema, venueNameSchema } from "@/lib/validation";

export type DetailsState = { error?: string };

const VENUE_TYPES: readonly string[] = venueType.enumValues;

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

/** Trim an optional text field to null-or-value, capped at `max` characters. */
function optionalText(
  value: FormDataEntryValue | null,
  max: number,
): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/**
 * Onboarding Step 1 — create the venue from the wizard's details form.
 *
 * This REPLACES the old two-field createVenue: it still creates the venue + the
 * owner's venue_members row atomically, but now also captures the Step 1 fields
 * (venue type, physical address, phone, logo URL) and advances onboarding_step
 * to 2. The slug is validated by the existing slugSchema + isReservedSlug; the
 * form pre-fills it from the name (slugify) so owners no longer hand-type the
 * public link (the Address->slug fix). onboarding_completed_at stays null — the
 * venue is not live-ready until the final step (3c).
 */
export async function createVenueFromOnboarding(
  _prevState: DetailsState,
  formData: FormData,
): Promise<DetailsState> {
  // Server Functions are reachable via direct POST — always re-check auth.
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
  const userId = session.user.id;

  const nameResult = venueNameSchema.safeParse(formData.get("name"));
  if (!nameResult.success) {
    return {
      error: nameResult.error.issues[0]?.message ?? "Invalid venue name.",
    };
  }
  const slugResult = slugSchema.safeParse(formData.get("slug"));
  if (!slugResult.success) {
    return { error: slugResult.error.issues[0]?.message ?? "Invalid address." };
  }
  const name = nameResult.data;
  const slug = slugResult.data;

  if (isReservedSlug(slug)) {
    return {
      error: `The address "${slug}" is reserved. Please choose another.`,
    };
  }

  // Venue type is optional but, when present, must be one of the enum values.
  const rawType = formData.get("venueType");
  const venueTypeValue =
    typeof rawType === "string" && VENUE_TYPES.includes(rawType)
      ? (rawType as (typeof venueType.enumValues)[number])
      : null;

  const streetAddress = optionalText(formData.get("streetAddress"), 200);
  const suburb = optionalText(formData.get("suburb"), 100);
  const state = optionalText(formData.get("state"), 100);
  const postcode = optionalText(formData.get("postcode"), 20);
  const country = optionalText(formData.get("country"), 100);
  const phone = optionalText(formData.get("phone"), 40);
  const logoUrl = optionalText(formData.get("logoUrl"), 2048);

  const slugTaken = await db
    .select({ id: venues.id })
    .from(venues)
    .where(eq(venues.slug, slug))
    .limit(1);
  if (slugTaken.length > 0) {
    return { error: `The address "${slug}" is already taken.` };
  }

  let newVenueId: string;
  try {
    newVenueId = await db.transaction(async (tx) => {
      const [venue] = await tx
        .insert(venues)
        .values({
          slug,
          name,
          ownerUserId: userId,
          venueType: venueTypeValue,
          streetAddress,
          suburb,
          state,
          postcode,
          country,
          phone,
          logoUrl,
          // Advance the resume pointer; onboarding stays incomplete until 3c.
          onboardingStep: 2,
        })
        .returning({ id: venues.id });
      await tx
        .insert(venueMembers)
        .values({ venueId: venue.id, userId, role: "owner" });
      return venue.id;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { error: `The address "${slug}" is already taken.` };
    }
    throw error;
  }

  await setSelectedVenueCookie(newVenueId);

  // Outside the try/catch: redirect throws a control-flow signal that must not
  // be swallowed. On to Step 2.
  redirect("/onboarding/service");
}
