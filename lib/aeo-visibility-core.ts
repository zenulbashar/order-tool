import type { AeoVisibilitySource } from "@/lib/db/schema";
import { AEO_QUESTIONS } from "@/lib/seo-audit";

/**
 * Pure decisions behind the AI-visibility probes (see lib/aeo-visibility.ts
 * for the provider call and persistence): which prompts are asked, how a
 * provider response is read, and what counts as "the venue was cited".
 * Dependency-free so they are unit-testable without a database or network.
 */

export const AEO_VISIBILITY_PROVIDER = "gemini";
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
/** Answers are stored for review; a few paragraphs is plenty. */
export const ANSWER_MAX_CHARS = 2000;
/** Runs kept per venue (one run = six rows). */
export const RUNS_KEEP = 12;

export type ProbeVenue = {
  id: string;
  slug: string;
  name: string;
  suburb: string | null;
  state: string | null;
  websiteUrl: string | null;
};

/**
 * The six canonical questions, asked the way a diner would ask an assistant
 * about THIS venue — name plus locality, so a generic "what can I eat there"
 * becomes answerable. Pure.
 */
export function buildProbePrompts(
  venue: Pick<ProbeVenue, "name" | "suburb" | "state">,
): { question: string; prompt: string }[] {
  const place = [venue.name, venue.suburb, venue.state]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(", ");
  const templates: Record<(typeof AEO_QUESTIONS)[number], string> = {
    "What kind of place is this?": `What kind of restaurant or cafe is ${place}?`,
    "Where is it?": `Where is ${place} located? Give the address.`,
    "When is it open?": `What are the opening hours of ${place}?`,
    "What can I eat there?": `What is on the menu at ${place}? Name some dishes.`,
    "What does it roughly cost?": `Roughly how much do dishes cost at ${place}?`,
    "Can I order online right now?": `Can I order food online from ${place}, and where?`,
  };
  return AEO_QUESTIONS.map((question) => ({
    question,
    prompt: templates[question],
  }));
}

export type CitationVerdict = {
  cited: boolean;
  citedBy: "storefront" | "website" | "name" | null;
};

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Was the venue cited? Strongest evidence first: a grounding source on OUR
 * storefront path, then the venue's own website, then the venue's name in the
 * answer text (whole-word, case-insensitive). Pure.
 */
export function detectCitation(input: {
  answer: string;
  sources: AeoVisibilitySource[];
  venue: Pick<ProbeVenue, "name" | "slug" | "websiteUrl">;
  siteOrigin: string;
}): CitationVerdict {
  const siteHost = hostOf(input.siteOrigin);
  const storefrontPath = `/${input.venue.slug.toLowerCase()}`;
  for (const source of input.sources) {
    const host = hostOf(source.uri);
    if (!host) continue;
    let path = "";
    try {
      path = new URL(source.uri).pathname.toLowerCase();
    } catch {
      path = "";
    }
    if (
      siteHost &&
      host === siteHost &&
      (path === storefrontPath || path.startsWith(`${storefrontPath}/`))
    ) {
      return { cited: true, citedBy: "storefront" };
    }
  }
  const websiteHost = input.venue.websiteUrl ? hostOf(input.venue.websiteUrl) : null;
  if (websiteHost) {
    for (const source of input.sources) {
      if (hostOf(source.uri) === websiteHost) {
        return { cited: true, citedBy: "website" };
      }
    }
  }
  const name = input.venue.name.trim();
  if (name.length >= 3) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, "iu").test(input.answer)) {
      return { cited: true, citedBy: "name" };
    }
  }
  return { cited: false, citedBy: null };
}

export type GroundedAnswer = { answer: string; sources: AeoVisibilitySource[] };

/**
 * Pull the answer text and grounding sources out of a generateContent
 * response. Tolerates missing pieces (no grounding, no candidates) so a thin
 * answer records as "not cited" rather than failing the run. Pure.
 */
export function parseGeminiResponse(json: unknown): GroundedAnswer {
  const root = (json ?? {}) as {
    candidates?: {
      content?: { parts?: { text?: string }[] };
      groundingMetadata?: {
        groundingChunks?: { web?: { uri?: string; title?: string } }[];
      };
    }[];
  };
  const candidate = root.candidates?.[0];
  const answer = (candidate?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim()
    .slice(0, ANSWER_MAX_CHARS);
  const sources: AeoVisibilitySource[] = [];
  for (const chunk of candidate?.groundingMetadata?.groundingChunks ?? []) {
    const uri = chunk.web?.uri;
    if (typeof uri === "string" && uri.length > 0) {
      sources.push({ uri, title: chunk.web?.title ?? null });
    }
  }
  return { answer, sources };
}

