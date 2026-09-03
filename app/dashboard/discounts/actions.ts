"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { promotions, promotionVenues } from "@/lib/db/schema";
import { requireVenuePermission } from "@/lib/tenant";

import { parseDiscountForm } from "./parse";

export type DiscountState = { error?: string; success?: boolean };

/**
 * Create an owner-managed, diner-redeemable discount CODE for the current venue.
 * Ownership comes from requireVenuePermission("promotions:manage") (never a client id). The promo is forced
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
  const venue = await requireVenuePermission("promotions:manage");

  const parsed = parseDiscountForm(formData, venue.timezone);
  if (!parsed.ok) return { error: parsed.error };
  const input = parsed.value;

  try {
    await db.transaction(async (tx) => {
      const [promo] = await tx
        .insert(promotions)
        .values({
          ...input,
          fundingSource: "merchant",
          platformFundedPercent: 0,
          scope: "selected",
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

/**
 * Edit one of the current venue's own discount codes (audit R3 — a value-bearing
 * entity that could be created and paused but never corrected).
 *
 * IDOR-safe the same way setOwnerDiscountActive is: the venue comes from the
 * session's permission check and is part of the WHERE, so a mismatched id
 * updates zero rows rather than another tenant's promo. Ownership is never taken
 * from the form.
 *
 * The code itself is editable — a typo in the code diners have to type is the
 * likeliest reason to want an edit at all, and redemption history hangs off
 * orders.applied_promo_id (the id, not the code), so past orders keep reporting
 * against it. `isActive` is deliberately NOT touched: pause/resume is its own
 * action, and folding it in here would let a save silently un-pause a code.
 */
export async function updateOwnerDiscount(
  _prev: DiscountState,
  formData: FormData,
): Promise<DiscountState> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
  const venue = await requireVenuePermission("promotions:manage");

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing discount id." };

  const parsed = parseDiscountForm(formData, venue.timezone);
  if (!parsed.ok) return { error: parsed.error };

  let updated: { id: string }[];
  try {
    updated = await db
      .update(promotions)
      .set(parsed.value)
      .where(and(eq(promotions.id, id), eq(promotions.ownerVenueId, venue.id)))
      .returning({ id: promotions.id });
  } catch {
    // Same partial unique index as create — (owner_venue_id, code).
    return { error: "That code is already in use. Try another." };
  }

  // Zero rows means the id isn't this venue's. Reported as not-found rather
  // than as success, so a wrong id can't look like a saved edit.
  if (updated.length === 0) {
    return { error: "That code no longer exists." };
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
  const venue = await requireVenuePermission("promotions:manage");
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (!id) return;

  await db
    .update(promotions)
    .set({ isActive: active })
    .where(and(eq(promotions.id, id), eq(promotions.ownerVenueId, venue.id)));

  revalidatePath("/dashboard/discounts");
}
