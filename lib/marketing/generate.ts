import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import { and, asc, eq } from "drizzle-orm";

import { getAnthropic, MENU_COPY_MODEL } from "@/lib/anthropic";
import { db } from "@/lib/db";
import { menuItems, type venues } from "@/lib/db/schema";
import {
  BRIEF_MENU_ITEMS,
  buildRequestBrief,
  buildVenueBrief,
  MARKETING_JSON_SCHEMA,
  MARKETING_SYSTEM,
  type MarketingDraft,
  type MarketingRequest,
  type MarketingVenue,
  parseMarketingDrafts,
} from "@/lib/marketing/core";
import { getBaseUrl } from "@/lib/url";

export const MARKETING_MODEL = MENU_COPY_MODEL;
const MARKETING_MAX_TOKENS = 1800;

export function isMarketingCopyConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

type VenueRow = typeof venues.$inferSelect;

/** The venue's own facts for the brief: profile + a few live item names. */
export async function loadMarketingVenue(
  venue: Pick<
    VenueRow,
    | "id"
    | "name"
    | "slug"
    | "venueType"
    | "storefrontDescription"
    | "suburb"
    | "state"
    | "instagramUrl"
  >,
): Promise<MarketingVenue> {
  const items = await db
    .select({ name: menuItems.name })
    .from(menuItems)
    .where(and(eq(menuItems.venueId, venue.id), eq(menuItems.isAvailable, true)))
    .orderBy(asc(menuItems.sortOrder), asc(menuItems.name))
    .limit(BRIEF_MENU_ITEMS);
  return {
    name: venue.name,
    venueType: venue.venueType,
    storefrontDescription: venue.storefrontDescription,
    suburb: venue.suburb,
    state: venue.state,
    storefrontUrl: `${await getBaseUrl()}/${venue.slug}`,
    instagramUrl: venue.instagramUrl,
    menuItems: items.map((item) => item.name),
  };
}

export type DraftCopyResult =
  | { ok: true; drafts: MarketingDraft[] }
  | { ok: false; error: string };

/**
 * One request → one draft per channel. The venue brief is a prompt-cached
 * system block (the same for every request an owner makes in a sitting); the
 * reply is forced to the JSON schema and re-validated per channel. Any failure
 * is a plain error, never a throw.
 */
export async function draftMarketingCopy(
  venue: MarketingVenue,
  request: MarketingRequest,
): Promise<DraftCopyResult> {
  if (!isMarketingCopyConfigured()) {
    return { ok: false, error: "AI drafting isn't switched on for this deployment yet." };
  }
  let message: Anthropic.Message;
  try {
    message = await getAnthropic().messages.create({
      model: MARKETING_MODEL,
      max_tokens: MARKETING_MAX_TOKENS,
      system: [
        { type: "text", text: MARKETING_SYSTEM },
        {
          type: "text",
          text: buildVenueBrief(venue),
          cache_control: { type: "ephemeral" },
        },
      ],
      output_config: { format: { type: "json_schema", schema: MARKETING_JSON_SCHEMA } },
      messages: [{ role: "user", content: buildRequestBrief(request) }],
    });
  } catch {
    return { ok: false, error: "Couldn't reach the drafting assistant. Try again in a moment." };
  }
  if (message.stop_reason === "refusal" || message.stop_reason === "max_tokens") {
    return { ok: false, error: "The assistant couldn't draft that. Try a shorter topic." };
  }
  const textBlock = message.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text",
  );
  let json: unknown = null;
  try {
    json = textBlock ? JSON.parse(textBlock.text) : null;
  } catch {
    json = null;
  }
  const drafts = parseMarketingDrafts(json, request.channels);
  if (drafts.length === 0) {
    return { ok: false, error: "The assistant gave an unusable reply. Try again." };
  }
  return { ok: true, drafts };
}
