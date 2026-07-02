"use server";

import type Anthropic from "@anthropic-ai/sdk";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getAnthropic, MENU_COPY_MODEL } from "@/lib/anthropic";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireVenue, type Venue } from "@/lib/tenant";
import {
  DIETARY_TAGS,
  type DietaryTag,
  normalizeDietaryTags,
} from "@/lib/validation";

/* -------------------------------------------------------------------------- */
/* AI dietary/allergen tag suggestions for one menu item.                      */
/*                                                                            */
/* Returns SUGGESTIONS only — this module never writes. The owner accepts a    */
/* suggestion by checking the existing "tags" checkbox in the item form and    */
/* saving through createItem/updateItem, so the write path (vocab validation,  */
/* venue-scoped replace-set) is untouched. LIFE-SAFETY: tags are venue-set     */
/* hints, never platform guarantees — the prompt is conservative on purpose    */
/* and the output is gated through normalizeDietaryTags so nothing outside     */
/* the fixed vocabulary can ever reach the UI.                                 */
/* -------------------------------------------------------------------------- */

const UNAVAILABLE =
  "Tag suggestions are temporarily unavailable. Please try again in a moment.";
const COULDNT_SUGGEST =
  "We couldn't suggest tags right now. Try again, or set them yourself.";

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
/* Precision over coverage: a wrong dietary tag is worse than a missing one,   */
/* so every rule biases toward omitting. halal and nut_free are explicit-only  */
/* (cross-contamination risk means they can never be inferred from a recipe).  */
/* -------------------------------------------------------------------------- */
const TAG_SYSTEM = `You suggest dietary tags for a café menu item from a FIXED vocabulary. You are given the item's name and sometimes its owner-written description. Tags are hints shown to customers, never safety guarantees, so precision matters far more than coverage.

The only allowed tags, and when each applies:
- vegan: the item clearly contains no animal products at all.
- vegetarian: the item clearly contains no meat, poultry, or seafood.
- gluten_friendly: the item is clearly made without wheat or other gluten ingredients.
- dairy_free: the item clearly contains no milk, cheese, butter, or cream.
- halal: ONLY when the name or description explicitly says halal.
- nut_free: ONLY when the name or description explicitly says nut free.
- spicy: the name or description clearly indicates chilli heat.

Rules:
- Suggest a tag ONLY when the name or description makes it obviously true. When in doubt, leave it out. An empty list is a good answer.
- Never infer from absence: "no nuts mentioned" does NOT mean nut_free, and "no meat mentioned" does NOT mean vegetarian.
- When vegan clearly applies, also include vegetarian and dairy_free (customers filter on each tag independently).
- Return only tags from the vocabulary above, each at most once.`;

/** Structured output: tags constrained to the vocabulary at the schema level. */
const TAG_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["tags"],
  properties: {
    tags: {
      type: "array",
      items: { type: "string", enum: DIETARY_TAGS.map((t) => t.value) },
    },
  },
};

// Zod re-validation of the model's JSON (a refusal or truncation can still
// slip through — never trusted). Values stay plain strings here because
// normalizeDietaryTags below is the vocabulary gate.
const tagResponseSchema = z.object({ tags: z.array(z.string()) });

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

export type SuggestTagsResult =
  | { ok: true; tags: DietaryTag[] }
  | { ok: false; error: string };

export async function suggestItemTags(input: {
  name: string;
  description?: string | null;
}): Promise<SuggestTagsResult> {
  const venue = await requireVenueForAction();

  const name = (input.name ?? "").trim();
  if (name.length === 0) {
    return { ok: false, error: "Add an item name first, then suggest tags." };
  }
  if (name.length > 100) {
    return { ok: false, error: "Item name is too long." };
  }
  // Description is optional context; over-long input is truncated, not erred,
  // since the field itself caps at 500 chars and this is advisory-only.
  const description = (input.description ?? "").trim().slice(0, 2000);

  // Per-venue cost gate IN FRONT of the metered call, sharing the aiCopy
  // budget with description drafting (after the cheap name check so an empty
  // name still gets its own message). Fail-open: a limiter/store error returns
  // success and never blocks the owner.
  const limit = await checkRateLimit("aiCopy", venue.id);
  if (!limit.success) {
    return {
      ok: false,
      error:
        "You've reached the AI suggestion limit for now. Please try again shortly.",
    };
  }

  const lines = [`Name: ${name}`];
  if (description.length > 0) lines.push(`Description: ${description}`);

  let message: Anthropic.Message;
  try {
    message = await getAnthropic().messages.create({
      model: MENU_COPY_MODEL,
      max_tokens: 300,
      system: TAG_SYSTEM,
      output_config: {
        format: { type: "json_schema", schema: TAG_JSON_SCHEMA },
      },
      messages: [{ role: "user", content: lines.join("\n") }],
    });
  } catch {
    return { ok: false, error: UNAVAILABLE };
  }

  const parsed = tagResponseSchema.safeParse(readJson(message));
  if (!parsed.success) {
    return { ok: false, error: COULDNT_SUGGEST };
  }

  // The vocabulary gate: off-list values are dropped, duplicates collapsed,
  // canonical order restored. An empty result is a valid answer ("nothing
  // clearly supported"), not an error.
  return { ok: true, tags: normalizeDietaryTags(parsed.data.tags) };
}
