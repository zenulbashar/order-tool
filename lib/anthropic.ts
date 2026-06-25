import Anthropic from "@anthropic-ai/sdk";

/**
 * Server-only Anthropic client for the menu-import vision extraction.
 *
 * LAZILY constructed (first call, not module load) — exactly the contract used
 * by getStripe() in lib/stripe.ts and the Neon pool in lib/db/index.ts: nothing
 * reads ANTHROPIC_API_KEY at import time, so `next build` / `tsc` / `eslint` all
 * run with NO env present. By the time a request calls getAnthropic(), the
 * runtime env is guaranteed present.
 *
 * Each call is a metered API cost (a few cents to ~tens of cents per menu) —
 * acceptable for an infrequent, one-time onboarding action.
 */

// Vision-capable model used to read a menu photo into structured JSON.
export const MENU_EXTRACTION_MODEL = "claude-opus-4-8";

// Text-only model used to draft appetising menu-item descriptions from a name,
// category, and price. Drafting a sentence or two needs no vision and no deep
// reasoning, so this deliberately uses a CHEAPER model than the vision
// extraction above — the same lazy getAnthropic() client, just a different
// model per call. Every call is an owner-initiated, metered API cost.
export const MENU_COPY_MODEL = "claude-haiku-4-5";

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — cannot initialise the Anthropic client.",
    );
  }
  client = new Anthropic({ apiKey });
  return client;
}
