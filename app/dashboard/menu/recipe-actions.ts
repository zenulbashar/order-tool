"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ingredients, menuItems, recipeLines } from "@/lib/db/schema";
import { requireVenue, scopedToVenue, type Venue } from "@/lib/tenant";
import { idSchema } from "@/lib/validation";

const MENU_PATH = "/dashboard/menu";

async function requireVenueForAction(): Promise<Venue> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
  return requireVenue();
}

/** Quantity in the ingredient's recipe unit; positive, may be fractional. */
const qtySchema = z
  .string()
  .trim()
  .refine(
    (v) => /^\d+(\.\d+)?$/.test(v) && Number(v) > 0,
    "Quantity must be a positive number.",
  )
  .transform((v) => Number(v));

/** Keep the selection URL (?item=) so the editor stays on the same item. */
function backToItem(formData: FormData): string {
  const itemId = idSchema.safeParse(formData.get("menuItemId"));
  return itemId.success
    ? `${MENU_PATH}?item=${encodeURIComponent(itemId.data)}`
    : MENU_PATH;
}

/**
 * Add a recipe line to a menu item. Both the item AND the ingredient are
 * re-verified to belong to THIS venue before the write (a forged id for
 * another venue resolves to no row and is rejected). One line per
 * (item, ingredient): a duplicate updates the qty instead of erroring.
 */
export async function addRecipeLine(formData: FormData): Promise<void> {
  const venue = await requireVenueForAction();
  const itemId = idSchema.safeParse(formData.get("menuItemId"));
  const ingredientId = idSchema.safeParse(formData.get("ingredientId"));
  const qty = qtySchema.safeParse(formData.get("qty"));
  if (!itemId.success || !ingredientId.success || !qty.success) {
    redirect(backToItem(formData));
  }

  const [item] = await db
    .select({ id: menuItems.id })
    .from(menuItems)
    .where(
      and(
        eq(menuItems.id, itemId.data),
        scopedToVenue(menuItems.venueId, venue.id),
      ),
    )
    .limit(1);
  const [ingredient] = await db
    .select({ id: ingredients.id })
    .from(ingredients)
    .where(
      and(
        eq(ingredients.id, ingredientId.data),
        scopedToVenue(ingredients.venueId, venue.id),
      ),
    )
    .limit(1);
  if (item && ingredient) {
    await db
      .insert(recipeLines)
      .values({
        venueId: venue.id,
        menuItemId: item.id,
        ingredientId: ingredient.id,
        qty: qty.data,
      })
      .onConflictDoUpdate({
        target: [recipeLines.menuItemId, recipeLines.ingredientId],
        set: { qty: qty.data },
      });
  }
  revalidatePath(MENU_PATH);
  redirect(backToItem(formData));
}

/** Change a recipe line's quantity (venue-scoped). */
export async function updateRecipeLine(formData: FormData): Promise<void> {
  const venue = await requireVenueForAction();
  const lineId = idSchema.safeParse(formData.get("id"));
  const qty = qtySchema.safeParse(formData.get("qty"));
  if (lineId.success && qty.success) {
    await db
      .update(recipeLines)
      .set({ qty: qty.data })
      .where(
        and(
          eq(recipeLines.id, lineId.data),
          scopedToVenue(recipeLines.venueId, venue.id),
        ),
      );
  }
  revalidatePath(MENU_PATH);
  redirect(backToItem(formData));
}

/** Remove a recipe line (venue-scoped). */
export async function removeRecipeLine(formData: FormData): Promise<void> {
  const venue = await requireVenueForAction();
  const lineId = idSchema.safeParse(formData.get("id"));
  if (lineId.success) {
    await db
      .delete(recipeLines)
      .where(
        and(
          eq(recipeLines.id, lineId.data),
          scopedToVenue(recipeLines.venueId, venue.id),
        ),
      );
  }
  revalidatePath(MENU_PATH);
  redirect(backToItem(formData));
}
