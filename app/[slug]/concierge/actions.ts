"use server";

import type Anthropic from "@anthropic-ai/sdk";
import { headers } from "next/headers";
import { z } from "zod";

import { getAnthropic, MENU_COPY_MODEL } from "@/lib/anthropic";
import { canUseConcierge } from "@/lib/concierge";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import {
  conciergeInputSchema,
  formatCents,
  isReservedSlug,
  MAX_CONCIERGE_ITEMS,
  type ConciergeInput,
} from "@/lib/validation";

import { getPublicMenu, getPublicVenueBySlug } from "../queries";
import type { PublicMenu } from "../types";

/**
 * Diner-facing AI ordering concierge (#12). The diner describes what they feel
 * like; the model proposes a cart of REAL menu items the diner reviews and adds.
 *
 * MONEY-SAFE BY CONSTRUCTION:
 *  - Grounded: the model may only pick from THIS venue's live getPublicMenu, and
 *    EVERY returned id is re-validated here against that set (unknowns dropped).
 *    The model returns IDS ONLY — never a price or name reaches the cart/UI.
 *  - Proposes, never commits: the result is a list of ids; the client routes a
 *    tap through the existing ItemModifierSheet + addItem. This action never
 *    touches placeOrder, the order webhook, the recompute, or the cart.
 *  - Venue-scoped: grounding + the rate-limit key are bound to this venue only.
 *  - Life-safety: the prompt forbids allergen-safety claims; dietary tags only
 *    filter, and every surface keeps the confirm-with-the-venue disclaimer.
 *
 * Cheap by design: runs on Haiku (MENU_COPY_MODEL) with the venue menu in a
 * prompt-cached system block and a short, single-turn structured response.
 */

/**
 * A proposed cart entry — IDS ONLY. The client resolves each id to its live
 * PublicItem (the name/price shown come from there, never the model) and opens
 * it through the existing modifier sheet, where the customer confirms size +
 * modifiers and the real price is displayed. `suggestedVariantId` is a non-
 * binding hint for a sized item (the sheet still requires an explicit choice).
 */
export type ConciergeProposal = {
  itemId: string;
  suggestedVariantId: string | null;
};

export type ConciergeResult =
  | { ok: true; items: ConciergeProposal[]; message: string }
  | { ok: false; error: string };

const UNAVAILABLE =
  "The menu assistant is unavailable right now. Please try again in a moment.";
const COULDNT_MATCH =
  "We couldn't find a good match. Try describing it a different way.";

/**
 * Structured-output schema handed to the model: it may return only item ids
 * (resolved against the live menu afterwards) + a short rationale. Like the menu
 * importer's schema this carries TYPES only — structured outputs reject length
 * bounds, so the item cap is enforced in code after grounding. itemId is a plain
 * string (NOT an enum of live ids) on purpose: a per-venue enum would churn the
 * 24h structured-output schema cache on every menu edit, and the server-side
 * validation below — not the schema — is the actual grounding guarantee.
 */
const CONCIERGE_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["items", "message"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["itemId", "suggestedVariantId"],
        properties: {
          itemId: { type: "string" },
          suggestedVariantId: { type: ["string", "null"] },
        },
      },
    },
    message: { type: "string" },
  },
};

/** Defensive parse of the model output (mirrors the importer's zod gate). */
const conciergeOutputSchema = z.object({
  items: z
    .array(
      z.object({
        itemId: z.string().trim().min(1),
        suggestedVariantId: z.string().trim().min(1).nullish(),
      }),
    )
    .max(50),
  message: z.string(),
});

const CONCIERGE_PROMPT = `You are an ordering concierge for a single café/restaurant. A diner describes what they feel like, and you propose a short cart of items FROM THIS VENUE'S MENU for them to review and add.

Rules:
- Only propose items from the MENU provided in the system context. Use each item's "id" EXACTLY as given. NEVER invent an item, a name, a price, or an id.
- Pick a focused set (about 1 to ${MAX_CONCIERGE_ITEMS} items) that best fits the request. If the diner asks for several things ("a coffee and a snack"), include one item for each.
- Respect explicit constraints: budget (use the prices in the menu), dietary needs (use each item's "tags"), and stated dislikes. If nothing fits, return an empty "items" list and say so briefly.
- If an item has "sizes", you may hint a size with its "id" in "suggestedVariantId" (e.g. the cheapest size for a tight budget); otherwise use null. The diner always confirms the size, so this is only a hint.
- "message": one or two short, friendly sentences about your picks. Do NOT state prices or totals — the diner sees the live price when they tap an item. Keep it brief.
- SAFETY: dietary tags are the venue's guide, not a guarantee. NEVER claim an item is allergen-free or safe for an allergy. If asked for an allergy guarantee, tell the diner to confirm directly with the venue.`;

/**
 * Compact, model-facing view of the live menu — the ONLY set the model may pick
 * from. Prices are included as INPUT so the model can honour a budget ("under
 * $20"); they are never trusted on output (ids are resolved to live prices
 * client-side). A variant-priced item lists its sizes (each with its own id +
 * price); a flat item carries a single price.
 */
function buildMenuContext(menu: PublicMenu): string {
  const items: Record<string, unknown>[] = [];
  for (const category of menu) {
    for (const item of category.items) {
      const entry: Record<string, unknown> = {
        id: item.id,
        name: item.name,
        category: category.name,
      };
      if (item.description) entry.description = item.description;
      if (item.tags.length > 0) entry.tags = item.tags;
      if (item.variants.length > 0) {
        entry.sizes = item.variants.map((variant) => ({
          id: variant.id,
          name: variant.name,
          price: `$${formatCents(variant.priceCents)}`,
        }));
      } else {
        entry.price = `$${formatCents(item.priceCents)}`;
      }
      items.push(entry);
    }
  }
  return `MENU (the ONLY items you may propose; use each "id" verbatim):\n${JSON.stringify(items)}`;
}

export async function proposeCart(
  input: ConciergeInput,
): Promise<ConciergeResult> {
  // (1) Validate shape + bounds. Hostile input: diner-facing + unauthenticated.
  const parsed = conciergeInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }
  const data = parsed.data;

  // (2) Resolve the venue by slug. Reserved slugs never resolve to a storefront
  // (matches the route backstop) — defense in depth.
  if (isReservedSlug(data.slug)) return { ok: false, error: UNAVAILABLE };
  const venue = await getPublicVenueBySlug(data.slug);
  if (!venue) return { ok: false, error: UNAVAILABLE };

  // (3) The SINGLE billing seam. Ungated today; the storefront also hides the
  // box on this, but Server Actions are reachable via direct POST — re-check.
  if (!(await canUseConcierge(venue))) {
    return { ok: false, error: UNAVAILABLE };
  }

  // (4) Per-venue + per-IP cost/spam gate IN FRONT of the metered model call.
  // Fail-open (a limiter/store error returns success), like every other AI call.
  const ip = clientIpFromHeaders(await headers());
  const limit = await checkRateLimit("aiConcierge", `${venue.id}:${ip}`);
  if (!limit.success) {
    return {
      ok: false,
      error:
        "You're sending requests too quickly. Please wait a moment, then try again.",
    };
  }

  // (5) Load the LIVE, venue-scoped menu — only is_available items in is_active
  // categories. This IS the grounding source of truth (availability + scope come
  // for free). An unpublished menu yields no suggestions.
  const menu = await getPublicMenu(venue.id);
  if (menu.length === 0) {
    return {
      ok: true,
      items: [],
      message: "This venue hasn't published a menu yet.",
    };
  }

  // (6) Ask Haiku, grounding the model in the prompt-cached menu and forcing a
  // structured JSON response. The diner's message + short history are the only
  // volatile content, after the cached system prefix.
  const conversation: Anthropic.MessageParam[] = [];
  for (const turn of data.history) {
    // The first message must be a user turn; drop any leading assistant turns
    // from a malformed/forged history (the API merges consecutive same-role).
    if (conversation.length === 0 && turn.role !== "user") continue;
    conversation.push({ role: turn.role, content: turn.content });
  }
  conversation.push({ role: "user", content: data.message });

  let message: Anthropic.Message;
  try {
    message = await getAnthropic().messages.create({
      model: MENU_COPY_MODEL,
      max_tokens: 1024,
      system: [
        { type: "text", text: CONCIERGE_PROMPT },
        {
          type: "text",
          text: buildMenuContext(menu),
          // Same menu across every conversation at this venue — cache it so the
          // input-token cost collapses on repeat/refine turns. 1h TTL widens the
          // reuse window past the 5-min default for intermittent diner traffic.
          cache_control: { type: "ephemeral", ttl: "1h" },
        },
      ],
      output_config: {
        format: { type: "json_schema", schema: CONCIERGE_SCHEMA },
      },
      messages: conversation,
    });
  } catch {
    // Network/SDK failure or missing API key — never crash the storefront.
    return { ok: false, error: UNAVAILABLE };
  }

  // (7) Defensive parse (mirrors the importer): a refusal or truncation is
  // treated as "no match", never a crash.
  if (
    message.stop_reason === "refusal" ||
    message.stop_reason === "max_tokens"
  ) {
    return { ok: false, error: COULDNT_MATCH };
  }
  const textBlock = message.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text",
  );
  if (!textBlock) return { ok: false, error: COULDNT_MATCH };

  let raw: unknown;
  try {
    raw = JSON.parse(textBlock.text);
  } catch {
    return { ok: false, error: COULDNT_MATCH };
  }
  const result = conciergeOutputSchema.safeParse(raw);
  if (!result.success) return { ok: false, error: COULDNT_MATCH };

  // (8) HARD GROUNDING GATE — the guarantee. Re-validate every id the model
  // returned against the live menu: DROP unknowns, dedupe, and resolve nothing
  // from the model except ids. A stray/foreign variant id is nulled (the sheet
  // will ask for the size), never trusted. Cap to MAX_CONCIERGE_ITEMS.
  const itemIds = new Set<string>();
  const variantIdsByItem = new Map<string, Set<string>>();
  for (const category of menu) {
    for (const item of category.items) {
      itemIds.add(item.id);
      variantIdsByItem.set(
        item.id,
        new Set(item.variants.map((variant) => variant.id)),
      );
    }
  }

  const seen = new Set<string>();
  const items: ConciergeProposal[] = [];
  for (const proposed of result.data.items) {
    if (items.length >= MAX_CONCIERGE_ITEMS) break;
    if (!itemIds.has(proposed.itemId) || seen.has(proposed.itemId)) continue;
    seen.add(proposed.itemId);
    const validVariants = variantIdsByItem.get(proposed.itemId);
    const suggestedVariantId =
      proposed.suggestedVariantId &&
      validVariants?.has(proposed.suggestedVariantId)
        ? proposed.suggestedVariantId
        : null;
    items.push({ itemId: proposed.itemId, suggestedVariantId });
  }

  return { ok: true, items, message: result.data.message };
}
