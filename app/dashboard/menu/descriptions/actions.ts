"use server";

import type Anthropic from "@anthropic-ai/sdk";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getAnthropic, MENU_COPY_MODEL } from "@/lib/anthropic";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { menuCategories, menuItems } from "@/lib/db/schema";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireVenue, scopedToVenue, type Venue } from "@/lib/tenant";
import {
  dollarsToCents,
  formatCents,
  MAX_DESCRIPTION_DRAFTS,
  saveDescriptionsSchema,
  type SaveDescriptionsInput,
} from "@/lib/validation";

const MENU_PATH = "/dashboard/menu";

/* -------------------------------------------------------------------------- */
/* Friendly errors. AI drafting never crashes and never writes on failure —    */
/* the owner can always write copy by hand instead.                            */
/* -------------------------------------------------------------------------- */
const UNAVAILABLE =
  "Description drafting is temporarily unavailable. Please try again in a moment.";
const COULDNT_DRAFT =
  "We couldn't draft a description right now. Try again, or write one yourself.";

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

/* -------------------------------------------------------------------------- */
/* Prompt + structured-output contract                                         */
/*                                                                            */
/* The rules live in the system prompt so they apply identically to the single */
/* and bulk calls. They encode the feature constraints: appetising but factual */
/* copy, NO invented ingredients / allergen / dietary / health claims, and the */
/* house style rules (no em/en dashes, no emojis, no ALL CAPS, no "!" spam).    */
/* -------------------------------------------------------------------------- */
const COPY_SYSTEM = `You write short, appetising menu descriptions for a café or restaurant. You are given an item's name, its menu category, and sometimes its price. Write copy that helps a hungry customer picture the item and want to order it.

Follow ALL of these rules for every description:
- Write 1 to 2 short sentences, under 40 words total.
- Write natural, human-sounding menu copy in plain sentence case. It must read as if a thoughtful café owner wrote it by hand, not as if a machine generated it.
- Do NOT use em-dashes (—) or en-dashes (–). Use commas, full stops, or the word "and" instead.
- Do NOT use emojis. Do NOT write any word in ALL CAPS. Do NOT spam exclamation marks: use at most one in the whole description, and prefer none.
- Do NOT invent facts. Describe only what the item's name and category fairly imply.
- Do NOT name specific ingredients the item's name does not already mention, and make NO allergen, dietary, nutritional, or health claims of any kind (for example: gluten-free, vegan, dairy-free, organic, "healthy", "contains nuts", calorie counts).
- Do NOT mention or imply the price, and do NOT repeat the item's name as a label or prefix.
- Do NOT wrap the description in quotation marks. Return the description text only.`;

/** Single-item structured output: just the description string. */
const SINGLE_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["description"],
  properties: { description: { type: "string" } },
};

/** Bulk structured output: one entry per item, keyed back by the input index. */
const BULK_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["descriptions"],
  properties: {
    descriptions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["index", "description"],
        properties: {
          index: { type: "integer" },
          description: { type: "string" },
        },
      },
    },
  },
};

// Zod re-validation of the model's JSON (the structured output should match the
// schema, but a refusal or truncation can still slip through — never trusted).
const singleResponseSchema = z.object({ description: z.string() });
const bulkResponseSchema = z.object({
  descriptions: z.array(
    z.object({ index: z.number().int(), description: z.string() }),
  ),
});

/** One item's context block for the prompt. Price is tone-only; never printed. */
function itemContext(
  name: string,
  categoryName: string | null,
  priceCents: number | null,
): string {
  const lines = [`Name: ${name}`];
  if (categoryName) lines.push(`Category: ${categoryName}`);
  if (priceCents !== null) lines.push(`Price: $${formatCents(priceCents)}`);
  return lines.join("\n");
}

/**
 * Belt-and-suspenders cleanup on top of the prompt rules: strip em/en dashes
 * (replaced with a comma so the sentence still reads), collapse whitespace,
 * drop wrapping quotes, and hard-cap at the column limit. The model is already
 * told not to produce dashes; this guarantees none reach the owner's field.
 */
function sanitizeCopy(raw: string): string {
  return raw
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/,\s*,/g, ",")
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .trim()
    .slice(0, 500);
}

/** Defensive read of a structured-output message into JSON, or null. */
function readJson(message: Anthropic.Message): unknown {
  if (
    message.stop_reason === "refusal" ||
    message.stop_reason === "max_tokens"
  ) {
    return null;
  }
  const textBlock = message.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text",
  );
  if (!textBlock) return null;
  try {
    return JSON.parse(textBlock.text);
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* 1) Single-item suggestion (item-form "Suggest description")                 */
/*                                                                            */
/* Returns a DRAFT only — it never writes. The owner reviews/edits the field   */
/* and the EXISTING item update ("Save changes") is the accept gate. Cost is   */
/* owner-initiated: auth + venue are re-checked before any API call.           */
/* -------------------------------------------------------------------------- */
export type SuggestResult =
  | { ok: true; description: string }
  | { ok: false; error: string };

export async function suggestItemDescription(input: {
  name: string;
  categoryId?: string | null;
  price?: string | null;
}): Promise<SuggestResult> {
  const venue = await requireVenueForAction();

  const name = (input.name ?? "").trim();
  if (name.length === 0) {
    return {
      ok: false,
      error: "Add an item name first, then suggest a description.",
    };
  }
  if (name.length > 100) {
    return { ok: false, error: "Item name is too long." };
  }

  // Resolve the category name server-side, venue-scoped: the form only sends an
  // id, and a missing or foreign id simply yields no category context (never an
  // error, never another venue's data).
  let categoryName: string | null = null;
  const categoryId = (input.categoryId ?? "").trim();
  if (categoryId.length > 0) {
    const [row] = await db
      .select({ name: menuCategories.name })
      .from(menuCategories)
      .where(
        and(
          eq(menuCategories.id, categoryId),
          scopedToVenue(menuCategories.venueId, venue.id),
        ),
      )
      .limit(1);
    categoryName = row?.name ?? null;
  }

  // Price is parsed exactly like the form (dollars -> cents); unparseable or
  // blank input is just omitted from the prompt.
  const priceCents = input.price ? dollarsToCents(input.price) : null;

  // Per-venue cost gate IN FRONT of the metered description call (after the
  // cheap name check so an empty name still gets its own message). Fail-open: a
  // limiter/store error returns success and never blocks drafting.
  const limit = await checkRateLimit("aiCopy", venue.id);
  if (!limit.success) {
    return {
      ok: false,
      error:
        "You've reached the description-drafting limit for now. Please try again shortly.",
    };
  }

  let message: Anthropic.Message;
  try {
    message = await getAnthropic().messages.create({
      model: MENU_COPY_MODEL,
      max_tokens: 400,
      system: COPY_SYSTEM,
      output_config: {
        format: { type: "json_schema", schema: SINGLE_JSON_SCHEMA },
      },
      messages: [
        { role: "user", content: itemContext(name, categoryName, priceCents) },
      ],
    });
  } catch {
    return { ok: false, error: UNAVAILABLE };
  }

  const parsed = singleResponseSchema.safeParse(readJson(message));
  if (!parsed.success) {
    return { ok: false, error: COULDNT_DRAFT };
  }
  const description = sanitizeCopy(parsed.data.description);
  if (description.length === 0) {
    return { ok: false, error: COULDNT_DRAFT };
  }
  // No write, no revalidate: the draft only populates the editable field.
  return { ok: true, description };
}

/* -------------------------------------------------------------------------- */
/* 2) Bulk draft for every empty-description item                              */
/*                                                                            */
/* Loads description-less items venue-scoped, drafts them in ONE batched API   */
/* call (cost/latency bound), and returns a review list. Writes NOTHING.       */
/* Capped at MAX_DESCRIPTION_DRAFTS per run; `capped` tells the owner to re-run */
/* for the remainder.                                                          */
/* -------------------------------------------------------------------------- */
export type DraftRow = {
  itemId: string;
  name: string;
  categoryName: string | null;
  priceCents: number;
  suggestion: string;
};
export type DraftEmptyResult =
  | { ok: true; drafts: DraftRow[]; capped: boolean }
  | { ok: false; error: string };

export async function draftEmptyDescriptions(): Promise<DraftEmptyResult> {
  const venue = await requireVenueForAction();

  // Empty = NULL (the manual + import CRUD store blank as null) or "" defensively.
  // Fetch one past the cap so we can flag `capped` without a second query.
  const rows = await db
    .select({
      id: menuItems.id,
      name: menuItems.name,
      priceCents: menuItems.priceCents,
      categoryName: menuCategories.name,
    })
    .from(menuItems)
    .innerJoin(menuCategories, eq(menuItems.categoryId, menuCategories.id))
    .where(
      and(
        scopedToVenue(menuItems.venueId, venue.id),
        scopedToVenue(menuCategories.venueId, venue.id),
        or(isNull(menuItems.description), eq(menuItems.description, "")),
      ),
    )
    .orderBy(asc(menuItems.createdAt))
    .limit(MAX_DESCRIPTION_DRAFTS + 1);

  const capped = rows.length > MAX_DESCRIPTION_DRAFTS;
  const items = rows.slice(0, MAX_DESCRIPTION_DRAFTS);

  if (items.length === 0) {
    return { ok: true, drafts: [], capped: false };
  }

  const list = items
    .map(
      (item, index) =>
        `${index}. Name: ${item.name}\n   Category: ${item.categoryName}\n   Price: $${formatCents(item.priceCents)}`,
    )
    .join("\n\n");
  const userText = `Draft a menu description for EACH item below. Return one entry per item in the "descriptions" array, reusing the exact numeric "index" shown for that item. Apply all the rules to every description.\n\n${list}`;

  // Per-venue cost gate IN FRONT of the metered bulk call. Sits after the
  // "nothing to draft" early return so an empty run never consumes budget.
  // Fail-open: a limiter/store error returns success and never blocks drafting.
  const limit = await checkRateLimit("aiCopy", venue.id);
  if (!limit.success) {
    return {
      ok: false,
      error:
        "You've reached the description-drafting limit for now. Please try again shortly.",
    };
  }

  let message: Anthropic.Message;
  try {
    message = await getAnthropic().messages.create({
      model: MENU_COPY_MODEL,
      // ~80 tokens/description * up to 40, plus JSON overhead, with headroom.
      max_tokens: 6000,
      system: COPY_SYSTEM,
      output_config: {
        format: { type: "json_schema", schema: BULK_JSON_SCHEMA },
      },
      messages: [{ role: "user", content: userText }],
    });
  } catch {
    return { ok: false, error: UNAVAILABLE };
  }

  const parsed = bulkResponseSchema.safeParse(readJson(message));
  if (!parsed.success) {
    return { ok: false, error: COULDNT_DRAFT };
  }

  // Map suggestions back to items by index; any item the model skipped keeps an
  // empty suggestion for the owner to fill in during review.
  const byIndex = new Map<number, string>();
  for (const entry of parsed.data.descriptions) {
    byIndex.set(entry.index, sanitizeCopy(entry.description));
  }

  const drafts: DraftRow[] = items.map((item, index) => ({
    itemId: item.id,
    name: item.name,
    categoryName: item.categoryName,
    priceCents: item.priceCents,
    suggestion: byIndex.get(index) ?? "",
  }));

  // No write, no revalidate: drafts are reviewed before saveItemDescriptions.
  return { ok: true, drafts, capped };
}

/* -------------------------------------------------------------------------- */
/* 3) Save the reviewed descriptions (the ONLY write path here)                */
/*                                                                            */
/* Writes ONLY the description column, row by row, each scoped by id AND        */
/* venue_id with a returning() assertion — so a forged id for another venue's   */
/* item can never have copy written, and a save can never touch price,          */
/* availability, category, or photo. Multi-location is live, so this row-level  */
/* scoping is the real IDOR gate (matches updateItem / the photo + variant      */
/* actions), not merely "the txn runs as the owner".                           */
/* -------------------------------------------------------------------------- */
export type SaveDescriptionsResult =
  | { ok: true; saved: number }
  | { ok: false; error: string };

export async function saveItemDescriptions(
  payload: SaveDescriptionsInput,
): Promise<SaveDescriptionsResult> {
  const venue = await requireVenueForAction();

  const parsed = saveDescriptionsSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]?.message ??
        "Some descriptions need fixing before saving.",
    };
  }

  let saved = 0;
  await db.transaction(async (tx) => {
    for (const item of parsed.data.items) {
      const updated = await tx
        .update(menuItems)
        .set({ description: item.description })
        .where(
          and(
            eq(menuItems.id, item.id),
            scopedToVenue(menuItems.venueId, venue.id),
          ),
        )
        .returning({ id: menuItems.id });
      // A forged/foreign/deleted id hits 0 rows: silently skipped, never an
      // error and never a cross-venue write.
      if (updated.length > 0) saved += 1;
    }
  });

  revalidatePath(MENU_PATH);
  return { ok: true, saved };
}
