"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { promotions, promotionVenues } from "@/lib/db/schema";
import { requireVenue } from "@/lib/tenant";

export type DiscountState = { error?: string; success?: boolean };

// Codes are stored uppercased; letters + digits only, no spaces.
const CODE_RE = /^[A-Z0-9]{3,24}$/;

/**
 * Create an owner-managed, diner-redeemable discount CODE for the current venue.
 * Ownership comes from requireVenue() (never a client id). The promo is forced
 * merchant-funded and scoped to this one venue, so it can never touch another
 * venue or the platform's co-funding accounting; it applies ONLY when a diner
 * enters the code at checkout (server-recomputed through the existing pipeline).
 */
export async function createOwnerDiscount(
  _prev: DiscountState,
  formData: FormData,
): Promise<DiscountState> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
  const venue = await requireVenue();

  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const type = formData.get("type") === "amount" ? "amount" : "percent";
  const rawValue = Number(String(formData.get("value") ?? "").trim());
  const minBasketRaw = String(formData.get("minBasket") ?? "").trim();
  const minBasketDollars = minBasketRaw === "" ? 0 : Number(minBasketRaw);
  const audience = formData.get("audience") === "new" ? "new" : "all";
  const endsAtRaw = String(formData.get("endsAt") ?? "").trim();

  if (name.length === 0 || name.length > 80) {
    return { error: "Enter a name (up to 80 characters)." };
  }
  if (!CODE_RE.test(code)) {
    return { error: "Code must be 3–24 letters or numbers, no spaces." };
  }
  if (!Number.isFinite(rawValue) || rawValue <= 0) {
    return { error: "Enter a discount value above 0." };
  }
  if (type === "percent" && rawValue > 100) {
    return { error: "A percentage can’t be over 100." };
  }
  const value = type === "percent" ? Math.round(rawValue) : Math.round(rawValue * 100);
  if (!Number.isFinite(minBasketDollars) || minBasketDollars < 0) {
    return { error: "Minimum spend can’t be negative." };
  }
  const minBasketCents = Math.round(minBasketDollars * 100);
  let endsAt: Date | null = null;
  if (endsAtRaw) {
    const parsed = new Date(endsAtRaw);
    if (Number.isNaN(parsed.getTime())) {
      return { error: "Enter a valid end date." };
    }
    endsAt = parsed;
  }

  try {
    await db.transaction(async (tx) => {
      const [promo] = await tx
        .insert(promotions)
        .values({
          name,
          code,
          type,
          value,
          minBasketCents,
          endsAt,
          fundingSource: "merchant",
          platformFundedPercent: 0,
          scope: "selected",
          audience,
          ownerVenueId: venue.id,
          isActive: true,
        })
        .returning({ id: promotions.id });
      await tx
        .insert(promotionVenues)
        .values({ promotionId: promo.id, venueId: venue.id });
    });
  } catch {
    // The partial unique index (owner_venue_id, code) rejects a duplicate.
    return { error: "That code is already in use. Try another." };
  }

  revalidatePath("/dashboard/discounts");
  return { success: true };
}

/** Pause / resume one of the current venue's own discount codes (IDOR-safe). */
export async function setOwnerDiscountActive(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
  const venue = await requireVenue();
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (!id) return;

  await db
    .update(promotions)
    .set({ isActive: active })
    .where(and(eq(promotions.id, id), eq(promotions.ownerVenueId, venue.id)));

  revalidatePath("/dashboard/discounts");
}
