"use server";

import type Anthropic from "@anthropic-ai/sdk";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getAnthropic, MENU_EXTRACTION_MODEL } from "@/lib/anthropic";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ingredients, invoiceScans, menuItems, recipeLines } from "@/lib/db/schema";
import { checkRateLimit } from "@/lib/rate-limit";
import { costPerUnitCents, dishCost, marginOf } from "@/lib/stock/cost";
import { requireVenue, scopedToVenue, type Venue } from "@/lib/tenant";

const STOCK_PATH = "/dashboard/stock";
const SCAN_PATH = "/dashboard/stock/scan";

/* -------------------------------------------------------------------------- */
/* Bounds — identical discipline to the menu-photo import: enforced server-side */
/* BEFORE any API call; the client mirrors them for feedback but these are the   */
/* real gate.                                                                    */
/* -------------------------------------------------------------------------- */
const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // ~5MB each
const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;
type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

const COULDNT_READ =
  "We couldn't read this invoice. Try a clearer, straight-on photo in good lighting.";
const UNAVAILABLE =
  "Invoice scanning is temporarily unavailable. Please try again in a moment.";

async function requireVenueForAction(): Promise<Venue> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
  return requireVenue();
}

/* -------------------------------------------------------------------------- */
/* Extraction — the vision model reads a supplier invoice into draft lines. Same */
/* structured-output pattern as the menu import; every price is nullable so the  */
/* model flags what it cannot read rather than inventing a number.               */
/* -------------------------------------------------------------------------- */

const INVOICE_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["supplier", "invoiceDate", "lines"],
  properties: {
    supplier: { type: "string" },
    invoiceDate: { type: "string" },
    lines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "packText", "unit", "packSize", "packCostCents"],
        properties: {
          name: { type: "string" },
          packText: { type: "string" },
          unit: { type: ["string", "null"], enum: ["g", "ml", "each", null] },
          packSize: { type: ["number", "null"] },
          packCostCents: { type: ["integer", "null"] },
        },
      },
    },
  },
};

const EXTRACTION_PROMPT = `You are reading photo(s) of a single supplier delivery invoice or order confirmation for a café/restaurant. Extract its purchasable line items into JSON matching the provided schema.

Rules:
- supplier: the supplier/vendor business name printed on the invoice header. If none is legible, use "".
- invoiceDate: the invoice/delivery date exactly as printed (e.g. "29 Jun 2026", "29/06/26"). If none is legible, use "".
- For each purchased product line, return its name (the product description), and the pack it was priced by.
- packText: copy the pack/size description exactly as printed (e.g. "12 x 1L", "5kg", "24 ea", "2L bottle"). Use "" if none is printed.
- unit: the recipe unit this product is measured in — "g" for weight, "ml" for volume/liquids, "each" for countable items. Pick the single best fit, or null if genuinely unclear.
- packSize: the TOTAL size of the pack expressed IN that unit as a number. Convert to the base unit: "12 x 1L" as ml = 12000; "5kg" as g = 5000; "24 ea" as each = 24; "2L" as ml = 2000. If you cannot work it out confidently, set null.
- packCostCents: the price paid for ONE pack (the line's unit price, NOT the extended line total for multiple packs), as an INTEGER number of cents: $28.80 -> 2880, $12 -> 1200. Exclude GST/tax if a separate ex-GST column is shown; otherwise use the printed price. If unreadable or ambiguous, set null. Never guess a number.
- OMIT delivery fees, discounts, subtotals, GST lines, and totals — only real purchasable products.
- OMIT any line you cannot read with confidence rather than inventing it.
- Return only what actually appears on the invoice.`;

// The model's raw output shape (post JSON-parse, pre-domain-validation).
const extractedLineSchema = z.object({
  name: z.string().trim().min(1).max(120),
  packText: z.string().trim().max(120),
  unit: z.enum(["g", "ml", "each"]).nullable(),
  packSize: z.number().positive().nullable(),
  packCostCents: z.number().int().nonnegative().nullable(),
});

const invoiceExtractionSchema = z.object({
  supplier: z.string().trim().max(120),
  invoiceDate: z.string().trim().max(60),
  lines: z.array(extractedLineSchema),
});

/**
 * A reviewed draft line, already matched to an existing ingredient where the
 * name lines up. `match` carries the CURRENT cost so the review gate can show
 * "was $X → $Y". Nothing here is a write — the owner confirms in the gate and
 * `applyInvoice` re-validates before touching a single row.
 */
export type DraftLine = {
  name: string;
  packText: string;
  unit: "g" | "ml" | "each" | null;
  packSize: number | null;
  packCostCents: number | null;
  match: {
    ingredientId: string;
    name: string;
    oldPackSize: number | null;
    oldPackCostCents: number | null;
    oldUnitCostCents: number | null;
    unit: "g" | "ml" | "each";
    yieldPct: number;
  } | null;
};

export type InvoiceDraft = {
  supplier: string;
  invoiceDate: string;
  lines: DraftLine[];
};

export type ExtractResult =
  | { ok: true; draft: InvoiceDraft }
  | { ok: false; error: string };

export async function extractInvoice(formData: FormData): Promise<ExtractResult> {
  const venue = await requireVenueForAction();

  const imageFiles = formData
    .getAll("images")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (imageFiles.length === 0) {
    return { ok: false, error: "Add at least one photo of your invoice." };
  }
  if (imageFiles.length > MAX_IMAGES) {
    return { ok: false, error: `Add at most ${MAX_IMAGES} photos.` };
  }
  for (const file of imageFiles) {
    if (file.size > MAX_IMAGE_BYTES) {
      return { ok: false, error: "Each photo must be 5MB or smaller." };
    }
    if (!ALLOWED_IMAGE_TYPES.includes(file.type as AllowedImageType)) {
      return { ok: false, error: "Photos must be JPEG, PNG, WebP, or GIF." };
    }
  }

  // Per-venue cost gate in front of the metered vision call. Shares the
  // "aiImport" bucket with the menu import (both are owner-initiated Opus vision
  // calls). Fail-open: a limiter/store error never blocks a scan.
  const limit = await checkRateLimit("aiImport", venue.id);
  if (!limit.success) {
    return {
      ok: false,
      error:
        "You've reached the scanning limit for now. Please try again in a little while.",
    };
  }

  // Image bytes are sent to the model for reading only — never stored.
  const imageBlocks: Anthropic.ImageBlockParam[] = [];
  for (const file of imageFiles) {
    const data = Buffer.from(await file.arrayBuffer()).toString("base64");
    imageBlocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: file.type as AllowedImageType,
        data,
      },
    });
  }

  const content: Anthropic.ContentBlockParam[] = [
    ...imageBlocks,
    { type: "text", text: EXTRACTION_PROMPT },
  ];

  let message: Anthropic.Message;
  try {
    message = await getAnthropic().messages.create({
      model: MENU_EXTRACTION_MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: {
        format: { type: "json_schema", schema: INVOICE_JSON_SCHEMA },
      },
      messages: [{ role: "user", content }],
    });
  } catch {
    return { ok: false, error: UNAVAILABLE };
  }

  if (message.stop_reason === "refusal" || message.stop_reason === "max_tokens") {
    return { ok: false, error: COULDNT_READ };
  }
  const textBlock = message.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text",
  );
  if (!textBlock) {
    return { ok: false, error: COULDNT_READ };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    return { ok: false, error: COULDNT_READ };
  }

  const result = invoiceExtractionSchema.safeParse(parsed);
  if (!result.success || result.data.lines.length === 0) {
    return { ok: false, error: COULDNT_READ };
  }

  // Match each extracted line to an existing venue ingredient by case-
  // insensitive name — the join that powers the "was $X → $Y" cost update. The
  // read is venue-scoped; a forged line can never reach another venue's library.
  const existing = await db
    .select()
    .from(ingredients)
    .where(scopedToVenue(ingredients.venueId, venue.id));
  const byName = new Map(
    existing.map((row) => [row.name.trim().toLowerCase(), row]),
  );

  const lines: DraftLine[] = result.data.lines.map((line) => {
    const hit = byName.get(line.name.toLowerCase());
    return {
      name: line.name,
      packText: line.packText,
      unit: line.unit,
      packSize: line.packSize,
      packCostCents: line.packCostCents,
      match: hit
        ? {
            ingredientId: hit.id,
            name: hit.name,
            oldPackSize: hit.packSize,
            oldPackCostCents: hit.packCostCents,
            oldUnitCostCents: costPerUnitCents(hit),
            unit: hit.unit,
            yieldPct: hit.yieldPct,
          }
        : null,
    };
  });

  return {
    ok: true,
    draft: {
      supplier: result.data.supplier,
      invoiceDate: result.data.invoiceDate,
      lines,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Apply — the ONLY path that writes. Reached solely from the review gate after  */
/* the owner confirms each decision. Every field is re-validated (the client     */
/* draft is not trusted) and every write is venue-scoped.                        */
/* -------------------------------------------------------------------------- */

const applyLineSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("skip") }),
  z.object({
    action: z.literal("update"),
    ingredientId: z.string().min(1),
    packSize: z.number().positive().nullable(),
    packCostCents: z.number().int().nonnegative().nullable(),
  }),
  z.object({
    action: z.literal("create"),
    name: z.string().trim().min(1).max(120),
    unit: z.enum(["g", "ml", "each"]),
    packSize: z.number().positive().nullable(),
    packCostCents: z.number().int().nonnegative().nullable(),
    supplier: z.string().trim().max(120).nullable(),
  }),
]);

const applyInvoiceSchema = z.object({
  supplier: z.string().trim().max(120).nullable(),
  lines: z.array(applyLineSchema),
});

export type ApplyInput = z.infer<typeof applyInvoiceSchema>;

export type ApplyResult =
  | {
      ok: true;
      supplier: string | null;
      linesUpdated: number;
      dishesRecosted: number;
      /** Change in average dish margin, in percentage POINTS (e.g. -2.1). */
      marginShiftPts: number | null;
    }
  | { ok: false; error: string };

/**
 * Cost-impact stats for the success screen — computed from a before/after
 * recost of every dish that has both a recipe and a price. `newCostById`
 * overlays the invoice's applied cost data onto the current ingredient rows so
 * the two passes differ ONLY by what this invoice changed. Pure read + arithmetic
 * — never writes.
 */
function costImpact(
  items: { id: string; priceCents: number }[],
  linesByItem: Map<
    string,
    { ingredientId: string; qty: number }[]
  >,
  ingredientById: Map<
    string,
    { packSize: number | null; packCostCents: number | null; yieldPct: number }
  >,
  newCostById: Map<
    string,
    { packSize: number | null; packCostCents: number | null }
  >,
): { dishesRecosted: number; marginShiftPts: number | null } {
  const oldMargins: number[] = [];
  const newMargins: number[] = [];
  let dishesRecosted = 0;

  for (const item of items) {
    const itemLines = linesByItem.get(item.id);
    if (!itemLines || itemLines.length === 0) continue;

    let touched = false;
    const oldLines = itemLines.map((line) => {
      const ing = ingredientById.get(line.ingredientId);
      return {
        qty: line.qty,
        ingredient: {
          packSize: ing?.packSize ?? null,
          packCostCents: ing?.packCostCents ?? null,
          yieldPct: ing?.yieldPct ?? 100,
        },
      };
    });
    const newLines = itemLines.map((line) => {
      const ing = ingredientById.get(line.ingredientId);
      const override = newCostById.get(line.ingredientId);
      if (override) touched = true;
      return {
        qty: line.qty,
        ingredient: {
          packSize: override ? override.packSize : ing?.packSize ?? null,
          packCostCents: override
            ? override.packCostCents
            : ing?.packCostCents ?? null,
          yieldPct: ing?.yieldPct ?? 100,
        },
      };
    });

    const oldMargin = marginOf(item.priceCents, dishCost(oldLines).totalCents);
    const newMargin = marginOf(item.priceCents, dishCost(newLines).totalCents);
    if (oldMargin) oldMargins.push(oldMargin.fraction);
    if (newMargin) newMargins.push(newMargin.fraction);
    if (touched) dishesRecosted += 1;
  }

  const avg = (xs: number[]) =>
    xs.length > 0 ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
  const oldAvg = avg(oldMargins);
  const newAvg = avg(newMargins);
  const marginShiftPts =
    oldAvg === null || newAvg === null
      ? null
      : Math.round((newAvg - oldAvg) * 1000) / 10; // 1 dp, in points

  return { dishesRecosted, marginShiftPts };
}

export async function applyInvoice(input: ApplyInput): Promise<ApplyResult> {
  const venue = await requireVenueForAction();

  const parsed = applyInvoiceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Some invoice lines need fixing before applying." };
  }

  const decisions = parsed.data.lines;
  const updates = decisions.filter((d) => d.action === "update");
  const creates = decisions.filter((d) => d.action === "create");

  if (updates.length === 0 && creates.length === 0) {
    return { ok: false, error: "Nothing to apply — every line is skipped." };
  }

  // Load the cost universe BEFORE writing so the success stats can compare a
  // before/after recost. All reads venue-scoped.
  const [existing, lines, items] = await Promise.all([
    db.select().from(ingredients).where(scopedToVenue(ingredients.venueId, venue.id)),
    db
      .select({
        menuItemId: recipeLines.menuItemId,
        ingredientId: recipeLines.ingredientId,
        qty: recipeLines.qty,
      })
      .from(recipeLines)
      .where(scopedToVenue(recipeLines.venueId, venue.id)),
    db
      .select({ id: menuItems.id, priceCents: menuItems.priceCents })
      .from(menuItems)
      .where(scopedToVenue(menuItems.venueId, venue.id)),
  ]);

  const ingredientById = new Map(existing.map((row) => [row.id, row]));
  const linesByItem = new Map<string, { ingredientId: string; qty: number }[]>();
  for (const line of lines) {
    const list = linesByItem.get(line.menuItemId) ?? [];
    list.push({ ingredientId: line.ingredientId, qty: line.qty });
    linesByItem.set(line.menuItemId, list);
  }

  // Build the applied-cost overlay for the recost pass. Only updates to EXISTING
  // ingredients recost live dishes; new ingredients aren't on any recipe yet.
  const newCostById = new Map<
    string,
    { packSize: number | null; packCostCents: number | null }
  >();
  for (const u of updates) {
    if (!ingredientById.has(u.ingredientId)) continue; // forged/foreign id → ignore
    newCostById.set(u.ingredientId, {
      packSize: u.packSize,
      packCostCents: u.packCostCents,
    });
  }

  const { dishesRecosted, marginShiftPts } = costImpact(
    items,
    linesByItem,
    new Map(
      [...ingredientById].map(([id, row]) => [
        id,
        {
          packSize: row.packSize,
          packCostCents: row.packCostCents,
          yieldPct: row.yieldPct,
        },
      ]),
    ),
    newCostById,
  );

  let updatedCount = 0;
  let createdCount = 0;

  await db.transaction(async (tx) => {
    for (const u of updates) {
      // Venue-scoped update — a forged id for another venue matches no row.
      const res = await tx
        .update(ingredients)
        .set({ packSize: u.packSize, packCostCents: u.packCostCents })
        .where(
          and(
            eq(ingredients.id, u.ingredientId),
            scopedToVenue(ingredients.venueId, venue.id),
          ),
        )
        .returning({ id: ingredients.id });
      if (res.length > 0) updatedCount += 1;
    }

    for (const c of creates) {
      await tx.insert(ingredients).values({
        venueId: venue.id,
        name: c.name,
        unit: c.unit,
        packSize: c.packSize,
        packCostCents: c.packCostCents,
        supplier: c.supplier,
        isPackaging: false,
      });
      createdCount += 1;
    }

    await tx.insert(invoiceScans).values({
      venueId: venue.id,
      supplier: parsed.data.supplier,
      lineCount: decisions.length,
      updatedCount,
      createdCount,
    });
  });

  revalidatePath(STOCK_PATH);
  revalidatePath(SCAN_PATH);

  return {
    ok: true,
    supplier: parsed.data.supplier,
    linesUpdated: updatedCount + createdCount,
    dishesRecosted,
    marginShiftPts,
  };
}
