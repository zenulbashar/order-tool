import { describe, expect, it } from "vitest";

import { computeAeoAudit, computeSeoAudit } from "@/lib/seo-audit";
import {
  AUDIT_MENU_ITEM_CAP,
  aeoLlmResponseSchema,
  buildAuditLlmInput,
  sanitizeCopy,
  seoLlmResponseSchema,
  toAeoGeneratedCopy,
  toSeoGeneratedCopy,
} from "@/lib/seo-audit-llm";
import type { AuditMenuItem, AuditVenue } from "@/lib/seo-audit";

function makeVenue(overrides: Partial<AuditVenue> = {}): AuditVenue {
  return {
    name: "Test Cafe",
    slug: "test-cafe",
    venueType: null,
    storefrontDescription: null,
    streetAddress: null,
    suburb: null,
    state: null,
    postcode: null,
    phone: null,
    openingHours: null,
    latitude: null,
    longitude: null,
    logoUrl: null,
    coverUrl: null,
    onboardingCompletedAt: null,
    instagramUrl: null,
    facebookUrl: null,
    xUrl: null,
    youtubeUrl: null,
    tiktokUrl: null,
    linkedinUrl: null,
    websiteUrl: null,
    ...overrides,
  };
}

function makeItem(index: number, overrides: Partial<AuditMenuItem> = {}): AuditMenuItem {
  return {
    id: `item-${index}`,
    name: `Item ${index}`,
    description: null,
    imageUrl: null,
    priceCents: 1000,
    isAvailable: true,
    categoryId: "cat-1",
    ...overrides,
  };
}

const validSeoResponse = {
  assessment: { verdict: "adequate", summary: "Solid but thin." },
  optimizedDescription:
    "A neighbourhood cafe serving coffee and brunch, open seven days with online ordering.",
  metaDescription:
    "Test Cafe in Brisbane. Coffee and brunch, order online for pickup.",
  recommendations: [{ title: "Add hours", detail: "Set your opening hours." }],
};

const validAeoResponse = {
  questions: [
    {
      question: "Where is it?",
      answerable: false,
      answer: "",
      gap: "No address on record.",
    },
  ],
  suggestedFaqs: [
    { question: "Can I order online?", answer: "Yes, through this page." },
  ],
  recommendations: [{ title: "Add address", detail: "Fill in the address." }],
};

describe("zod re-validation", () => {
  it("accepts well-formed responses", () => {
    expect(seoLlmResponseSchema.safeParse(validSeoResponse).success).toBe(true);
    expect(aeoLlmResponseSchema.safeParse(validAeoResponse).success).toBe(true);
  });

  it("rejects missing keys and out-of-enum verdicts", () => {
    const missingKey: Record<string, unknown> = { ...validSeoResponse };
    delete missingKey.assessment;
    expect(seoLlmResponseSchema.safeParse(missingKey).success).toBe(false);
    expect(
      seoLlmResponseSchema.safeParse({
        ...validSeoResponse,
        assessment: { verdict: "amazing", summary: "x" },
      }).success,
    ).toBe(false);
  });

  it("rejects a too-short optimized description (refusal-shaped output)", () => {
    expect(
      seoLlmResponseSchema.safeParse({
        ...validSeoResponse,
        optimizedDescription: "No.",
      }).success,
    ).toBe(false);
  });
});

describe("sanitizeCopy", () => {
  it("strips dashes, wrapping quotes, and repeated whitespace", () => {
    expect(sanitizeCopy('"Coffee — done   right"', 100)).toBe(
      "Coffee, done right",
    );
  });

  it("hard-caps at the given length", () => {
    expect(sanitizeCopy("x".repeat(300), 50)).toHaveLength(50);
  });
});

describe("normalizers", () => {
  it("clamps meta description to 160 and caps recommendations at 5", () => {
    const parsed = seoLlmResponseSchema.parse({
      ...validSeoResponse,
      metaDescription: "m".repeat(400),
      recommendations: Array.from({ length: 9 }, (_, i) => ({
        title: `Rec ${i}`,
        detail: `Detail ${i}`,
      })),
    });
    const { copy, recommendations } = toSeoGeneratedCopy(parsed);
    expect(copy.metaDescription).toHaveLength(160);
    expect(recommendations).toHaveLength(5);
    expect(copy.optimizedDescription!.length).toBeLessThanOrEqual(480);
  });

  it("caps suggested FAQs at 6 and keeps the Q&A simulation", () => {
    const parsed = aeoLlmResponseSchema.parse({
      ...validAeoResponse,
      suggestedFaqs: Array.from({ length: 10 }, (_, i) => ({
        question: `Q${i}?`,
        answer: `A${i}.`,
      })),
    });
    const { copy } = toAeoGeneratedCopy(parsed);
    expect(copy.suggestedFaqs).toHaveLength(6);
    expect(copy.qa).toHaveLength(1);
    expect(copy.qa?.[0].answerable).toBe(false);
  });
});

describe("buildAuditLlmInput", () => {
  it("caps the menu digest and clips long item descriptions", () => {
    const venue = makeVenue();
    const items = Array.from({ length: AUDIT_MENU_ITEM_CAP + 20 }, (_, i) =>
      makeItem(i, { description: "d".repeat(500) }),
    );
    const categories = [{ id: "cat-1", name: "Mains" }];
    const report = computeSeoAudit(venue, items, categories);
    const input = buildAuditLlmInput(venue, items, categories, report);

    const itemLines = input
      .split("\n")
      .filter((line) => /^- Item \d+ \(\$/.test(line));
    expect(itemLines).toHaveLength(AUDIT_MENU_ITEM_CAP);
    expect(input).toContain(`first ${AUDIT_MENU_ITEM_CAP} shown`);
    expect(input).not.toContain("d".repeat(121));
  });

  it("lists the failed checks so recommendations target real gaps", () => {
    const venue = makeVenue();
    const report = computeSeoAudit(venue, [], []);
    const input = buildAuditLlmInput(venue, [], [], report);
    expect(input).toContain(`Failed audit checks (${report.issues.length})`);
    expect(input).toContain("Storefront description");
  });

  it("appends the canonical diner questions only for AEO runs", () => {
    const venue = makeVenue();
    const seoInput = buildAuditLlmInput(
      venue,
      [],
      [],
      computeSeoAudit(venue, [], []),
    );
    const aeoInput = buildAuditLlmInput(
      venue,
      [],
      [],
      computeAeoAudit(venue, [], []),
    );
    expect(seoInput).not.toContain("Diner questions to grade");
    expect(aeoInput).toContain("Diner questions to grade");
    expect(aeoInput).toContain("What kind of place is this?");
  });
});
