"use server";

import type Anthropic from "@anthropic-ai/sdk";
import { desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAnthropic, MENU_EXTRACTION_MODEL } from "@/lib/anthropic";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { menuCategories, menuItems, menuItemVariants } from "@/lib/db/schema";
import { requireVenue, scopedToVenue, type Venue } from "@/lib/tenant";
import {
  extractionSchema,
  publishDraftSchema,
  type ExtractedMenu,
  type PublishDraftInput,
} from "@/lib/validation";

const MENU_PATH = "/dashboard/menu";

/* -------------------------------------------------------------------------- */
/* Bounds (cost/abuse caps). Enforced server-side BEFORE any API call; the      */
/* review client mirrors them for fast feedback, but these are the real gate.   */
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
  "We couldn't read this menu. Try a clearer, straight-on photo in good lighting.";
const UNAVAILABLE =
  "Menu import is temporarily unavailable. Please try again in a moment.";

export type ExtractResult =
  | { ok: true; draft: ExtractedMenu }
  | { ok: false; error: string };

export type PublishResult =
  | {
      ok: true;
      addedCategories: number;
      addedItems: number;
      addedSizes: number;
    }
  | { ok: false; error: string };

/**
 * Server Functions are reachable via direct POST, so re-check auth on every
 * call before resolving the tenant. Unauthenticated -> /signin; authenticated
 * but no venue yet -> /onboarding (via requireVenue). These redirects throw a
 * control-flow signal, so callers must invoke this OUTSIDE any try/catch.
 */
async function requireVenueForAction(): Promise<Venue> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
  return requireVenue();
}

/**
 * Structured-output schema handed to the vision model. Types only — structured
 * outputs reject min/max/length constraints, so bounds are enforced afterwards
 * by extractionSchema (zod). priceCents is nullable so the model can flag a
 * price it can't read rather than guessing one. `sizes` carries proposed size
 * variants (each name + nullable price) for a size-priced item, and is [] for a
 * flat item — its price is nullable too, mirroring the item price.
 */
const MENU_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["categories"],
  properties: {
    categories: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "items"],
        properties: {
          name: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: [
                "name",
                "priceCents",
                "priceText",
                "description",
                "sizes",
              ],
              properties: {
                name: { type: "string" },
                priceCents: { type: ["integer", "null"] },
                priceText: { type: "string" },
                description: { type: "string" },
                sizes: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["name", "priceCents"],
                    properties: {
                      name: { type: "string" },
                      priceCents: { type: ["integer", "null"] },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

const EXTRACTION_PROMPT = `You are reading photo(s) of a single café/restaurant menu. Extract it into JSON matching the provided schema.

Rules:
- Group items under the category headings printed on the menu (e.g. Coffee, Breakfast, Mains). If there are no headings, use one category named "Menu".
- For each item give its name, its price, and a short description ONLY if one is printed on the menu.
- Return priceCents as an INTEGER number of cents: $4.50 -> 450, $12 -> 1200.
- SIZES: when an item clearly lists more than one size, each with its own price (e.g. "Latte S $4 / L $5", "Pot of tea $6 / Cup $4", a row or column of sizes with prices), set that item's priceCents to null and return each size in the "sizes" array — its printed size name (e.g. "Small", "Large", "Regular") and its price as INTEGER cents. Read a size's price exactly like an item price: if you cannot read it confidently, set that size's priceCents to null. NEVER invent a size name or price that is not printed.
- For an item with a SINGLE price, return an EMPTY "sizes" array and the normal priceCents.
- If a price is missing, unreadable, or ambiguous — e.g. "from $7.90", a range, "MP"/"market price" — set priceCents to null and copy the exact printed price text into priceText. Do NOT guess a number. When you are unsure whether something really is a set of sizes, prefer a single flat item with priceCents null (so the owner sets it) over inventing sizes.
- When a real numeric price is given, leave priceText as "". When there is no description, leave description as "".
- OMIT any item or category you cannot read with confidence rather than inventing it.
- Do NOT extract a size as its own item — attach it to its parent item's "sizes" instead. Do NOT extract add-ons or modifier options as items or sizes.
- Return only what actually appears on the menu.`;

export async function extractMenu(formData: FormData): Promise<ExtractResult> {
  await requireVenueForAction();

  // Collect uploaded images and apply the caps BEFORE touching the API.
  const imageFiles = formData
    .getAll("images")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (imageFiles.length === 0) {
    return { ok: false, error: "Add at least one photo of your menu." };
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

  // The image bytes are sent to the model for extraction only — never stored.
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
      output_config: { format: { type: "json_schema", schema: MENU_JSON_SCHEMA } },
      messages: [{ role: "user", content }],
    });
  } catch {
    // Network/SDK failure, or missing API key — never crash, never publish.
    return { ok: false, error: UNAVAILABLE };
  }

  // Defensive parsing: structured output should be valid JSON matching the
  // schema, but a refusal or a truncated (max_tokens) response can still slip
  // through. Treat anything unexpected as an unreadable menu.
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

  const result = extractionSchema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, error: COULDNT_READ };
  }

  const itemCount = result.data.categories.reduce(
    (total, category) => total + category.items.length,
    0,
  );
  if (result.data.categories.length === 0 || itemCount === 0) {
    return { ok: false, error: COULDNT_READ };
  }

  return { ok: true, draft: result.data };
}

/** Next sort_order = MAX(sort_order)+1 within the venue (categories are top level). */
async function nextCategorySort(venueId: string): Promise<number> {
  const rows = await db
    .select({ sortOrder: menuCategories.sortOrder })
    .from(menuCategories)
    .where(scopedToVenue(menuCategories.venueId, venueId))
    .orderBy(desc(menuCategories.sortOrder))
    .limit(1);
  return (rows[0]?.sortOrder ?? -1) + 1;
}

/**
 * Publish the FINAL human-reviewed draft into the existing menu. This is the
 * ONLY path that writes anything; it is reached solely from the explicit
 * "Add these to my menu" action after review. APPEND semantics — it never
 * wipes or replaces. Every field is re-validated here (the client draft is not
 * trusted) and every write is venue-scoped.
 *
 * A reviewed item is EITHER flat (a single price, inserted exactly as before) OR
 * sized (>= 1 reviewed size). For a sized item the base price_cents is derived
 * server-side as the MIN of its size prices (a sensible non-null value that
 * satisfies NOT NULL + CHECK; it is NEVER a charge source — checkout reads the
 * chosen variant's own price — and matches the "from $X" display), and each size
 * becomes a menu_item_variants row through the SAME bounds + sort_order
 * convention as the owner variant CRUD. publishDraftSchema has already rejected
 * any zero-size sized item or null/invalid size price BEFORE this transaction, so
 * no half-built sized item can be written.
 */
export async function publishMenu(
  draft: PublishDraftInput,
): Promise<PublishResult> {
  const venue = await requireVenueForAction();

  const parsed = publishDraftSchema.safeParse(draft);
  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]?.message ??
        "Some menu details need fixing before publishing.",
    };
  }

  let addedCategories = 0;
  let addedItems = 0;
  let addedSizes = 0;

  // Multi-row write -> transaction; every statement carries venue_id. New
  // categories append after existing ones; items append within their new
  // category from sort_order 0, and a sized item's sizes from sort_order 0.
  await db.transaction(async (tx) => {
    let categorySort = await nextCategorySort(venue.id);
    for (const category of parsed.data.categories) {
      const [created] = await tx
        .insert(menuCategories)
        .values({
          venueId: venue.id,
          name: category.name,
          description: null,
          sortOrder: categorySort,
        })
        .returning({ id: menuCategories.id });
      categorySort += 1;
      addedCategories += 1;

      let itemSort = 0;
      for (const item of category.items) {
        const sized = item.sizes.length > 0;
        // Base price: a sized item uses the MIN of its size prices (never a
        // charge source; satisfies NOT NULL + CHECK; matches "from $X"). A flat
        // item uses its own resolved price — the schema's refine guarantees one
        // is present, so `?? 0` is a type guard only, never an actual write.
        const basePriceCents = sized
          ? Math.min(...item.sizes.map((size) => size.priceCents))
          : item.priceCents ?? 0;

        const [createdItem] = await tx
          .insert(menuItems)
          .values({
            venueId: venue.id,
            categoryId: created.id,
            name: item.name,
            description: item.description,
            priceCents: basePriceCents,
            sortOrder: itemSort,
          })
          .returning({ id: menuItems.id });
        itemSort += 1;
        addedItems += 1;

        if (sized) {
          // Each reviewed size -> a venue-scoped menu_item_variants row, with the
          // SAME bounds (name + non-negative cents, already validated by
          // publishSizeSchema) and sort_order convention (array order from 0) as
          // the owner variant CRUD. No separate variant write model.
          await tx.insert(menuItemVariants).values(
            item.sizes.map((size, sizeIndex) => ({
              venueId: venue.id,
              itemId: createdItem.id,
              name: size.name,
              priceCents: size.priceCents,
              sortOrder: sizeIndex,
            })),
          );
          addedSizes += item.sizes.length;
        }
      }
    }
  });

  revalidatePath(MENU_PATH);
  return { ok: true, addedCategories, addedItems, addedSizes };
}
