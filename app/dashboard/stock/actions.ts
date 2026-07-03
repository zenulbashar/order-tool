"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ingredients } from "@/lib/db/schema";
import { requireVenue, scopedToVenue, type Venue } from "@/lib/tenant";
import { idSchema } from "@/lib/validation";

const STOCK_PATH = "/dashboard/stock";

async function requireVenueForAction(): Promise<Venue> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
  return requireVenue();
}

/**
 * Ingredient input. name + unit are required; pack size / cost / supplier are
 * OPTIONAL so an ingredient can be added name-only and costed later
 * ("uncosted"). Empty pack fields normalise to null. Pack cost is entered in
 * dollars and stored as integer cents; pack size is a quantity in the recipe
 * unit and may be fractional.
 */
const ingredientSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
  unit: z.enum(["g", "ml", "each"]),
  packSize: z
    .string()
    .trim()
    .transform((v) => (v.length > 0 ? v : null))
    .refine(
      (v) => v === null || (/^\d+(\.\d+)?$/.test(v) && Number(v) > 0),
      "Pack size must be a positive number.",
    )
    .transform((v) => (v === null ? null : Number(v))),
  packCost: z
    .string()
    .trim()
    .transform((v) => (v.length > 0 ? v : null))
    .refine(
      (v) => v === null || /^\d+(\.\d{1,2})?$/.test(v),
      "Enter a pack cost like 28.80.",
    )
    .transform((v) => (v === null ? null : Math.round(Number(v) * 100))),
  yieldPct: z
    .string()
    .trim()
    .transform((v) => (v.length > 0 ? v : "100"))
    .refine(
      (v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 100,
      "Yield must be a whole number from 1 to 100.",
    )
    .transform((v) => Number(v)),
  supplier: z
    .string()
    .trim()
    .max(120)
    .transform((v) => (v.length > 0 ? v : null)),
});

function parseIngredient(formData: FormData) {
  return ingredientSchema.safeParse({
    name: formData.get("name") ?? "",
    unit: formData.get("unit") ?? "",
    packSize: formData.get("packSize") ?? "",
    packCost: formData.get("packCost") ?? "",
    yieldPct: formData.get("yieldPct") ?? "",
    supplier: formData.get("supplier") ?? "",
  });
}

export async function createIngredient(formData: FormData): Promise<void> {
  const venue = await requireVenueForAction();
  const parsed = parseIngredient(formData);
  if (!parsed.success) redirect(`${STOCK_PATH}?error=ingredient`);

  const isPackaging = formData.get("isPackaging") === "on";
  await db.insert(ingredients).values({
    venueId: venue.id,
    name: parsed.data.name,
    unit: parsed.data.unit,
    packSize: parsed.data.packSize,
    packCostCents: parsed.data.packCost,
    yieldPct: parsed.data.yieldPct,
    supplier: parsed.data.supplier,
    isPackaging,
  });
  revalidatePath(STOCK_PATH);
  redirect(STOCK_PATH);
}

export async function updateIngredient(formData: FormData): Promise<void> {
  const venue = await requireVenueForAction();
  const idParsed = idSchema.safeParse(formData.get("id"));
  const parsed = parseIngredient(formData);
  if (!idParsed.success || !parsed.success) {
    redirect(`${STOCK_PATH}?error=ingredient`);
  }
  const isPackaging = formData.get("isPackaging") === "on";

  // Venue-scoped update — a forged id for another venue matches no row.
  await db
    .update(ingredients)
    .set({
      name: parsed.data.name,
      unit: parsed.data.unit,
      packSize: parsed.data.packSize,
      packCostCents: parsed.data.packCost,
      yieldPct: parsed.data.yieldPct,
      supplier: parsed.data.supplier,
      isPackaging,
    })
    .where(
      and(
        eq(ingredients.id, idParsed.data),
        scopedToVenue(ingredients.venueId, venue.id),
      ),
    );
  revalidatePath(STOCK_PATH);
  redirect(STOCK_PATH);
}

export async function deleteIngredient(formData: FormData): Promise<void> {
  const venue = await requireVenueForAction();
  const idParsed = idSchema.safeParse(formData.get("id"));
  if (idParsed.success) {
    await db
      .delete(ingredients)
      .where(
        and(
          eq(ingredients.id, idParsed.data),
          scopedToVenue(ingredients.venueId, venue.id),
        ),
      );
  }
  revalidatePath(STOCK_PATH);
  redirect(STOCK_PATH);
}
