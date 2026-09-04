import { describe, expect, it } from "vitest";

import {
  buildProbePrompts,
  detectCitation,
  parseGeminiResponse,
} from "@/lib/aeo-visibility-core";
import { AEO_QUESTIONS } from "@/lib/seo-audit";

/**
 * The AI-visibility probe's decisions are pure: which prompts are asked, how a
 * provider response is read, and what counts as "the venue was cited". A false
 * "cited" would tell an owner their storefront is visible to AI search when it
 * is not; a false "not cited" would send them chasing a problem they don't have.
 */
const venue = {
  name: "Harbour Bao",
  slug: "harbour-bao",
  suburb: "Manly",
  state: "NSW",
  websiteUrl: "https://www.harbourbao.com.au/",
};
const SITE = "https://prompt2eat.com";

describe("buildProbePrompts", () => {
  it("asks all six canonical questions, personalised to the venue and locality", () => {
    const prompts = buildProbePrompts(venue);
    expect(prompts.map((p) => p.question)).toEqual([...AEO_QUESTIONS]);
    for (const { prompt } of prompts) {
      expect(prompt).toContain("Harbour Bao, Manly, NSW");
    }
  });

  it("drops missing locality parts instead of printing blanks", () => {
    const [first] = buildProbePrompts({ name: "Harbour Bao", suburb: null, state: null });
    expect(first.prompt).toContain("Harbour Bao?");
    expect(first.prompt).not.toContain(",");
  });
});

describe("detectCitation", () => {
  it("counts a grounding source on the venue's own storefront as the strongest citation", () => {
    expect(
      detectCitation({
        answer: "Here are the hours.",
        sources: [{ uri: `${SITE}/harbour-bao/menu`, title: "Menu" }],
        venue,
        siteOrigin: SITE,
      }),
    ).toEqual({ cited: true, citedBy: "storefront" });
  });

  it("does not let another venue's storefront count", () => {
    expect(
      detectCitation({
        answer: "Try the dumplings.",
        sources: [{ uri: `${SITE}/other-place`, title: null }],
        venue,
        siteOrigin: SITE,
      }),
    ).toEqual({ cited: false, citedBy: null });
    // A slug that merely PREFIXES ours is a different venue.
    expect(
      detectCitation({
        answer: "",
        sources: [{ uri: `${SITE}/harbour-bao-express`, title: null }],
        venue,
        siteOrigin: SITE,
      }).cited,
    ).toBe(false);
  });

  it("counts the venue's own website, host-matched with or without www", () => {
    expect(
      detectCitation({
        answer: "",
        sources: [{ uri: "https://harbourbao.com.au/menu", title: null }],
        venue,
        siteOrigin: SITE,
      }),
    ).toEqual({ cited: true, citedBy: "website" });
  });

  it("falls back to the venue's name in the answer, as a whole word", () => {
    expect(
      detectCitation({
        answer: "Harbour Bao in Manly is open until 9pm.",
        sources: [],
        venue,
        siteOrigin: SITE,
      }),
    ).toEqual({ cited: true, citedBy: "name" });
    expect(
      detectCitation({
        answer: "Harbour Baos Ltd is a shipping company.",
        sources: [],
        venue,
        siteOrigin: SITE,
      }).cited,
    ).toBe(false);
  });

  it("reports not cited when neither sources nor the answer mention the venue", () => {
    expect(
      detectCitation({
        answer: "I couldn't find that place.",
        sources: [{ uri: "https://maps.google.com/x", title: "Maps" }],
        venue,
        siteOrigin: SITE,
      }),
    ).toEqual({ cited: false, citedBy: null });
  });
});

describe("parseGeminiResponse", () => {
  it("joins the text parts and lists the web grounding sources", () => {
    const parsed = parseGeminiResponse({
      candidates: [
        {
          content: { parts: [{ text: "Open " }, { text: "until 9pm." }] },
          groundingMetadata: {
            groundingChunks: [
              { web: { uri: "https://prompt2eat.com/harbour-bao", title: "Harbour Bao" } },
              { retrievedContext: {} },
            ],
          },
        },
      ],
    });
    expect(parsed.answer).toBe("Open until 9pm.");
    expect(parsed.sources).toEqual([
      { uri: "https://prompt2eat.com/harbour-bao", title: "Harbour Bao" },
    ]);
  });

  it("returns an empty answer and no sources for a thin or malformed response", () => {
    expect(parseGeminiResponse({})).toEqual({ answer: "", sources: [] });
    expect(parseGeminiResponse(null)).toEqual({ answer: "", sources: [] });
    expect(parseGeminiResponse({ candidates: [{ content: {} }] })).toEqual({
      answer: "",
      sources: [],
    });
  });
});
