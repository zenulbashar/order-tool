"use server";

import type Anthropic from "@anthropic-ai/sdk";
import { and, asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getAnthropic, MENU_COPY_MODEL } from "@/lib/anthropic";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { menuItems } from "@/lib/db/schema";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireVenue, scopedToVenue, type Venue } from "@/lib/tenant";

/* -------------------------------------------------------------------------- */
/* AI banner copy (Track G, Studio v2 / option A).                             */
/*                                                                            */
/* Claude writes the banner TEXT — headline, subtext, and an optional offer     */
/* badge — from the venue's own name, description, and a few menu highlights,   */
/* plus an optional occasion the owner types. The existing branded BannerArtwork */
/* then renders that copy in the venue's brand colour + logo. This drafts only:  */
/* it never writes anything and never touches the money path. (True AI-painted   */
/* imagery would need a third-party image model — a separate, gated arc.)        */
/* -------------------------------------------------------------------------- */

const UNAVAILABLE =
  "AI copy is temporarily unavailable. Please try again in a moment, or write the banner yourself.";
const COULDNT_DRAFT =
  "We couldn't draft banner copy right now. Try again, or write it yourself.";

/**
 * Server Functions are reachable via direct POST, so re-check auth on every call
 * before resolving the tenant. These redirects throw a control-flow signal, so
 * callers must invoke this OUTSIDE any try/catch.
 */
async function requireVenueForAction(): Promise<Venue> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
  return requireVenue();
}

// The rules live in the system prompt. They encode the feature constraints:
// short branded promo copy, and — load-bearing — NEVER inventing a discount or
// offer the venue hasn't actually stated (a fabricated "20% OFF" on a banner is
// a promise the venue would have to honour). Same no-invented-facts, house-style
// discipline as the menu-description drafter.
const BANNER_SYSTEM = `You write short promotional banner copy for a hospitality venue (a café, restaurant, or bar). You are given the venue name, an optional description, a few menu highlights, and an optional occasion or theme the owner typed. Produce three fields for a graphic banner: a headline, a subtext line, and an optional short offer badge.

Follow ALL of these rules:
- headline: a punchy, appealing line of at most 6 words and under 45 characters. Sentence case or light title case. Do NOT write any word in ALL CAPS.
- subtext: ONE supporting sentence under 90 characters, in plain sentence case (for example "Order ahead and skip the queue").
- offer: a very short badge of at most 3 words / 20 characters, included ONLY if the occasion text explicitly states a real offer or discount the owner gave (for example the owner wrote "20% off" or "kids eat free"). If no explicit offer is provided, return an EMPTY string for offer. NEVER invent a discount, price, freebie, deal, or urgency ("today only") that the owner did not state.
- Do NOT invent facts, menu items, ingredients, allergen / dietary / nutritional / health claims, dates, or opening hours. Use only what the name, description, highlights, and occasion fairly imply.
- Do NOT use em-dashes (—) or en-dashes (–); use commas or full stops instead. Do NOT use emojis. Do NOT spam exclamation marks: at most one across all fields, and prefer none.
- Do NOT wrap any field in quotation marks. Return the text only.`;

const BANNER_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "subtext", "offer"],
  properties: {
    headline: { type: "string" },
    subtext: { type: "string" },
    offer: { type: "string" },
  },
};

const bannerResponseSchema = z.object({
  headline: z.string(),
  subtext: z.string(),
  offer: z.string(),
});

/** House-style cleanup + hard length caps matching the banner input fields. */
function sanitize(raw: string, max: number): string {
  return raw
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/,\s*,/g, ",")
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .trim()
    .slice(0, max);
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

const occasionSchema = z.string().trim().max(160);

export type BannerCopyResult =
  | { ok: true; headline: string; subtext: string; offer: string }
  | { ok: false; error: string };

export async function generateBannerCopy(input: {
  occasion?: string | null;
}): Promise<BannerCopyResult> {
  const venue = await requireVenueForAction();

  const occasion = occasionSchema.safeParse(input.occasion ?? "");
  const occasionText = occasion.success ? occasion.data : "";

  // A handful of live item names give the model real, venue-specific flavour to
  // write around — read server-side (authoritative), never trusted from the
  // client. Availability-scoped so hidden items don't leak into promo copy.
  const highlights = await db
    .select({ name: menuItems.name })
    .from(menuItems)
    .where(
      and(
        scopedToVenue(menuItems.venueId, venue.id),
        eq(menuItems.isAvailable, true),
      ),
    )
    .orderBy(asc(menuItems.createdAt))
    .limit(8);

  // Per-venue cost gate IN FRONT of the metered call. Fail-open: a limiter/store
  // error returns success and never blocks drafting.
  const limit = await checkRateLimit("aiCopy", venue.id);
  if (!limit.success) {
    return {
      ok: false,
      error:
        "You've reached the AI copy limit for now. Please try again shortly.",
    };
  }

  const contextLines = [`Venue name: ${venue.name}`];
  if (venue.storefrontDescription) {
    contextLines.push(`Description: ${venue.storefrontDescription}`);
  }
  if (highlights.length > 0) {
    contextLines.push(
      `Menu highlights: ${highlights.map((h) => h.name).join(", ")}`,
    );
  }
  contextLines.push(
    `Occasion or theme: ${occasionText.length > 0 ? occasionText : "(none given — write general, welcoming promo copy; leave offer empty)"}`,
  );

  let message: Anthropic.Message;
  try {
    message = await getAnthropic().messages.create({
      model: MENU_COPY_MODEL,
      max_tokens: 400,
      system: BANNER_SYSTEM,
      output_config: {
        format: { type: "json_schema", schema: BANNER_JSON_SCHEMA },
      },
      messages: [{ role: "user", content: contextLines.join("\n") }],
    });
  } catch {
    return { ok: false, error: UNAVAILABLE };
  }

  const parsed = bannerResponseSchema.safeParse(readJson(message));
  if (!parsed.success) {
    return { ok: false, error: COULDNT_DRAFT };
  }

  const headline = sanitize(parsed.data.headline, 80);
  const subtext = sanitize(parsed.data.subtext, 120);
  const offer = sanitize(parsed.data.offer, 24);
  if (headline.length === 0 && subtext.length === 0) {
    return { ok: false, error: COULDNT_DRAFT };
  }

  // No write, no revalidate: the copy only populates the editable banner fields.
  return { ok: true, headline, subtext, offer };
}
