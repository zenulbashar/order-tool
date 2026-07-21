"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ingredients } from "@/lib/db/schema";
import { recordStockMovement } from "@/lib/stock/movements";
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
  // Reorder threshold (recipe unit) — low-stock when on-hand drops below it.
  // Optional; empty normalises to null. On-hand itself is NEVER set here — it
  // is ledger-managed (adjustStock), so a plain form edit can't corrupt it.
  parLevel: z
    .string()
    .trim()
    .transform((v) => (v.length > 0 ? v : null))
    .refine(
      (v) => v === null || (/^\d+(\.\d+)?$/.test(v) && Number(v) >= 0),
      "Par level must be a non-negative number.",
    )
    .transform((v) => (v === null ? null : Number(v))),
});

function parseIngredient(formData: FormData) {
  return ingredientSchema.safeParse({
    name: formData.get("name") ?? "",
    unit: formData.get("unit") ?? "",
    packSize: formData.get("packSize") ?? "",
    packCost: formData.get("packCost") ?? "",
    yieldPct: formData.get("yieldPct") ?? "",
    supplier: formData.get("supplier") ?? "",
    parLevel: formData.get("parLevel") ?? "",
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
    parLevel: parsed.data.parLevel,
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
      parLevel: parsed.data.parLevel,
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

/**
 * Adjust an ingredient's on-hand stock through the ledger (Track D · D4a). Three
 * owner modes:
 *   - receive: a delivery arrived (+qty, "receiving")
 *   - remove:  waste / spoilage / usage taken off (−qty, "wastage")
 *   - set:     reconcile to a counted absolute (delta = count − current;
 *              "opening" the first time this ingredient is counted, else
 *              "stocktake")
 * Every write goes through recordStockMovement so the ledger and the cached
 * on_hand_qty move together. Venue-scoped: the ingredient is re-loaded under the
 * venue before any write, so a forged id touches nothing.
 */
const adjustSchema = z.object({
  mode: z.enum(["receive", "remove", "set"]),
  qty: z
    .string()
    .trim()
    .refine(
      (v) => /^\d+(\.\d+)?$/.test(v) && Number(v) >= 0,
      "Enter a quantity like 12 or 0.5.",
    )
    .transform((v) => Number(v)),
  note: z
    .string()
    .trim()
    .max(200)
    .transform((v) => (v.length > 0 ? v : null)),
});

export async function adjustStock(formData: FormData): Promise<void> {
  const venue = await requireVenueForAction();
  const idParsed = idSchema.safeParse(formData.get("id"));
  const parsed = adjustSchema.safeParse({
    mode: formData.get("mode") ?? "",
    qty: formData.get("qty") ?? "",
    note: formData.get("note") ?? "",
  });
  if (!idParsed.success || !parsed.success) {
    redirect(`${STOCK_PATH}?error=stock`);
  }

  // Re-load the ingredient under this venue — the ownership gate AND the source
  // of the current on-hand a "set" reconciles against.
  const [ingredient] = await db
    .select({ id: ingredients.id, onHandQty: ingredients.onHandQty })
    .from(ingredients)
    .where(
      and(
        eq(ingredients.id, idParsed.data),
        scopedToVenue(ingredients.venueId, venue.id),
      ),
    )
    .limit(1);
  if (!ingredient) redirect(`${STOCK_PATH}?error=stock`);

  const { mode, qty, note } = parsed.data;

  await db.transaction(async (tx) => {
    let deltaQty: number;
    let reason: "receiving" | "wastage" | "opening" | "stocktake";
    if (mode === "receive") {
      deltaQty = qty;
      reason = "receiving";
    } else if (mode === "remove") {
      deltaQty = -qty;
      reason = "wastage";
    } else {
      // set: reconcile to the counted absolute. Re-read on-hand UNDER a row lock
      // inside this tx (not the unlocked read above) so a concurrent depletion or
      // adjustment can't land between the read and the movement and corrupt the
      // count — e.g. count "set 12" reading 10 while a sale depletes 2 would
      // otherwise settle at 10, not the counted 12.
      const [locked] = await tx
        .select({ onHandQty: ingredients.onHandQty })
        .from(ingredients)
        .where(
          and(
            eq(ingredients.id, ingredient.id),
            eq(ingredients.venueId, venue.id),
          ),
        )
        .for("update")
        .limit(1);
      const current = locked?.onHandQty ?? 0;
      deltaQty = qty - current;
      reason = locked?.onHandQty == null ? "opening" : "stocktake";
    }

    await recordStockMovement(tx, {
      venueId: venue.id,
      ingredientId: ingredient.id,
      deltaQty,
      reason,
      note,
    });
  });

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
