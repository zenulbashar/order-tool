import { describe, expect, it } from "vitest";

import {
  type AuditMenuCategory,
  type AuditMenuItem,
  type AuditVenue,
  computeAeoAudit,
  computeSeoAudit,
  effectiveMetaDescription,
  SEO_GOOD_SCORE,
  SEO_OK_SCORE,
  structuredDataBlocks,
} from "@/lib/seo-audit";

/* ------------------------------ factories -------------------------------- */

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

let itemSeq = 0;
function makeItem(overrides: Partial<AuditMenuItem> = {}): AuditMenuItem {
  itemSeq += 1;
  return {
    id: `item-${itemSeq}`,
    name: `Item ${itemSeq}`,
    description: null,
    imageUrl: null,
    priceCents: 1200,
    isAvailable: true,
    categoryId: "cat-1",
    ...overrides,
  };
}

function makeCategory(
  overrides: Partial<AuditMenuCategory> = {},
): AuditMenuCategory {
  return { id: "cat-1", name: "Mains", ...overrides };
}

// 118 chars — satisfies description depth (70+) AND the 70–160 snippet window.
const RICH_DESCRIPTION =
  "Family-run corner cafe pouring specialty coffee and baking everything on site, seven days. Order online for pickup daily.";

/** A venue + menu that should pass every check in both audits. */
function perfectSetup() {
  const venue = makeVenue({
    venueType: "cafe",
    storefrontDescription: RICH_DESCRIPTION,
    streetAddress: "1 Test St",
    suburb: "Brisbane",
    state: "QLD",
    postcode: "4000",
    phone: "07 3000 0000",
    openingHours: [{ day: 0, opens: "07:00", closes: "15:00" }],
    latitude: -27.47,
    longitude: 153.03,
    logoUrl: "https://img.example/logo.png",
    coverUrl: "https://img.example/cover.jpg",
    onboardingCompletedAt: new Date("2026-01-01T00:00:00Z"),
    instagramUrl: "https://instagram.com/testcafe",
  });
  const categories = [
    makeCategory({ id: "cat-1", name: "Mains" }),
    makeCategory({ id: "cat-2", name: "Drinks" }),
  ];
  const items = Array.from({ length: 6 }, (_, index) =>
    makeItem({
      id: `perfect-${index}`,
      name: `Dish number ${index}`,
      description: "A properly tempting description of this dish.",
      imageUrl: "https://img.example/dish.jpg",
      priceCents: 1000 + index * 100,
      categoryId: index < 3 ? "cat-1" : "cat-2",
    }),
  );
  return { venue, categories, items };
}

/* --------------------------------- tests --------------------------------- */

describe("computeSeoAudit / computeAeoAudit — invariants", () => {
  it("weights sum to exactly 100 for both audits", () => {
    const { venue, items, categories } = perfectSetup();
    const seo = computeSeoAudit(venue, items, categories);
    const aeo = computeAeoAudit(venue, items, categories);
    expect(seo.checks.reduce((sum, c) => sum + c.weight, 0)).toBe(100);
    expect(aeo.checks.reduce((sum, c) => sum + c.weight, 0)).toBe(100);
  });

  it("is deterministic for identical input", () => {
    const { venue, items, categories } = perfectSetup();
    expect(computeSeoAudit(venue, items, categories)).toEqual(
      computeSeoAudit(venue, items, categories),
    );
    expect(computeAeoAudit(venue, items, categories)).toEqual(
      computeAeoAudit(venue, items, categories),
    );
  });

  it("a complete venue scores 100 / good with no issues on both audits", () => {
    const { venue, items, categories } = perfectSetup();
    for (const report of [
      computeSeoAudit(venue, items, categories),
      computeAeoAudit(venue, items, categories),
    ]) {
      expect(report.score).toBe(100);
      expect(report.band).toBe("good");
      expect(report.issues).toEqual([]);
      expect(report.checks.every((c) => c.passed || !c.applicable)).toBe(true);
    }
  });

  it("every failed applicable check yields exactly one issue, high first", () => {
    const report = computeSeoAudit(makeVenue(), [], []);
    const failed = report.checks.filter((c) => c.applicable && !c.passed);
    expect(report.issues.length).toBe(failed.length);
    expect(new Set(report.issues.map((i) => i.checkId))).toEqual(
      new Set(failed.map((c) => c.id)),
    );
    const rank = { high: 0, medium: 1, low: 2 } as const;
    for (let i = 1; i < report.issues.length; i += 1) {
      expect(rank[report.issues[i - 1].severity]).toBeLessThanOrEqual(
        rank[report.issues[i].severity],
      );
    }
  });
});

describe("computeSeoAudit — empty venue", () => {
  it("marks menu coverage checks inapplicable instead of stacking failures", () => {
    const report = computeSeoAudit(makeVenue(), [], []);
    const byId = new Map(report.checks.map((c) => [c.id, c]));
    expect(byId.get("menu_present")?.passed).toBe(false);
    expect(byId.get("menu_present")?.applicable).toBe(true);
    for (const id of [
      "menu_descriptions",
      "menu_photos",
      "menu_structure",
      "menu_duplicate_free",
    ]) {
      expect(byId.get(id)?.applicable).toBe(false);
    }
    expect(report.band).toBe("poor");
    expect(report.score).toBeLessThan(SEO_OK_SCORE);
  });

  it("treats fully-hidden menus as no menu", () => {
    const items = [makeItem({ isAvailable: false })];
    const report = computeSeoAudit(makeVenue(), items, [makeCategory()]);
    const byId = new Map(report.checks.map((c) => [c.id, c]));
    expect(byId.get("menu_present")?.passed).toBe(false);
    expect(byId.get("menu_descriptions")?.applicable).toBe(false);
  });
});

describe("computeSeoAudit — thresholds", () => {
  function checkFor(venue: AuditVenue, id: string) {
    const report = computeSeoAudit(venue, [], []);
    return report.checks.find((c) => c.id === id);
  }

  it("description presence at 20 chars, depth at 70", () => {
    expect(
      checkFor(makeVenue({ storefrontDescription: "x".repeat(19) }), "description_present")
        ?.passed,
    ).toBe(false);
    const at20 = makeVenue({ storefrontDescription: "x".repeat(20) });
    expect(checkFor(at20, "description_present")?.passed).toBe(true);
    expect(checkFor(at20, "description_depth")?.passed).toBe(false);
    expect(
      checkFor(makeVenue({ storefrontDescription: "x".repeat(70) }), "description_depth")
        ?.passed,
    ).toBe(true);
  });

  it("snippet window passes at 70–160 effective characters only", () => {
    for (const [length, passes] of [
      [69, false],
      [70, true],
      [160, true],
      [161, false],
    ] as const) {
      const venue = makeVenue({ storefrontDescription: "x".repeat(length) });
      expect(checkFor(venue, "meta_description_fit")?.passed).toBe(passes);
    }
  });

  it("falls back to the page's generated snippet when no description is set", () => {
    const venue = makeVenue({ name: "Test Cafe" });
    expect(effectiveMetaDescription(venue)).toBe("Order online from Test Cafe.");
  });

  it("item description coverage passes at 70%, photos at 50%", () => {
    const venue = makeVenue();
    const categories = [makeCategory()];
    const items = (described: number, photographed: number) =>
      Array.from({ length: 10 }, (_, index) =>
        makeItem({
          id: `t-${index}`,
          name: `Thing ${index}`,
          description:
            index < described ? "A long enough item description." : null,
          imageUrl: index < photographed ? "https://img.example/i.jpg" : null,
        }),
      );

    const at = (described: number, photographed: number, id: string) =>
      computeSeoAudit(venue, items(described, photographed), categories).checks.find(
        (c) => c.id === id,
      );

    expect(at(7, 10, "menu_descriptions")?.passed).toBe(true);
    expect(at(6, 10, "menu_descriptions")?.passed).toBe(false);
    expect(at(10, 5, "menu_photos")?.passed).toBe(true);
    expect(at(10, 4, "menu_photos")?.passed).toBe(false);
  });

  it("address requires all four parts; geo requires both coordinates", () => {
    const partial = makeVenue({
      streetAddress: "1 Test St",
      suburb: "Brisbane",
      state: "QLD",
    });
    expect(checkFor(partial, "address_complete")?.passed).toBe(false);
    expect(
      checkFor(makeVenue({ latitude: -27.5 }), "geo_present")?.passed,
    ).toBe(false);
    // 0 is a legitimate coordinate and must count as set.
    expect(
      checkFor(makeVenue({ latitude: 0, longitude: 0 }), "geo_present")?.passed,
    ).toBe(true);
  });

  it("slug quality accepts clean kebab slugs only", () => {
    for (const [slug, passes] of [
      ["good-slug", true],
      ["a", true],
      ["a".repeat(40), true],
      ["a".repeat(41), false],
      ["-bad", false],
      ["bad-", false],
      ["Bad", false],
      ["1234", false],
    ] as const) {
      expect(checkFor(makeVenue({ slug }), "slug_quality")?.passed).toBe(passes);
    }
  });

  it("duplicate available item names fail the duplicate check", () => {
    const venue = makeVenue();
    const categories = [makeCategory()];
    const items = [
      makeItem({ id: "d1", name: "Flat White" }),
      makeItem({ id: "d2", name: "flat white " }),
    ];
    const report = computeSeoAudit(venue, items, categories);
    expect(
      report.checks.find((c) => c.id === "menu_duplicate_free")?.passed,
    ).toBe(false);
  });
});

describe("computeAeoAudit", () => {
  it("aeo_where passes on geo alone (no address)", () => {
    const venue = makeVenue({ latitude: -27.5, longitude: 153.0 });
    const report = computeAeoAudit(venue, [], []);
    expect(report.checks.find((c) => c.id === "aeo_where")?.passed).toBe(true);
  });

  it("structured coverage passes at 5 of 6 blocks", () => {
    const fourOfSix = makeVenue({
      logoUrl: "https://img.example/logo.png",
      phone: "07 3000 0000",
      streetAddress: "1 Test St",
      openingHours: [{ day: 0, opens: "07:00", closes: "15:00" }],
    });
    expect(structuredDataBlocks(fourOfSix, []).filter((b) => b.present)).toHaveLength(4);
    expect(
      computeAeoAudit(fourOfSix, [], []).checks.find(
        (c) => c.id === "aeo_structured_coverage",
      )?.passed,
    ).toBe(false);

    const fiveOfSix = makeVenue({
      ...fourOfSix,
      latitude: -27.5,
      longitude: 153.0,
    });
    const check = computeAeoAudit(fiveOfSix, [], []).checks.find(
      (c) => c.id === "aeo_structured_coverage",
    );
    expect(check?.passed).toBe(true);
  });

  it("a failed coverage check deep-links the first missing block", () => {
    const report = computeAeoAudit(makeVenue(), [], []);
    const check = report.checks.find((c) => c.id === "aeo_structured_coverage");
    expect(check?.passed).toBe(false);
    expect(check?.fixHref).toBe("/dashboard/settings/logo");
  });

  it("price range scales its target down for small menus", () => {
    const venue = makeVenue();
    const categories = [makeCategory()];
    const smallAllPriced = Array.from({ length: 3 }, (_, index) =>
      makeItem({ id: `s-${index}`, name: `Small ${index}`, priceCents: 900 }),
    );
    expect(
      computeAeoAudit(venue, smallAllPriced, categories).checks.find(
        (c) => c.id === "aeo_price",
      )?.passed,
    ).toBe(true);

    const sixPartlyPriced = Array.from({ length: 6 }, (_, index) =>
      makeItem({
        id: `p-${index}`,
        name: `Priced ${index}`,
        priceCents: index < 4 ? 900 : 0,
      }),
    );
    expect(
      computeAeoAudit(venue, sixPartlyPriced, categories).checks.find(
        (c) => c.id === "aeo_price",
      )?.passed,
    ).toBe(false);
  });

  it("band cutoffs sit at the shared thresholds", () => {
    // Sanity of the exported constants rather than a synthetic score walk.
    expect(SEO_OK_SCORE).toBe(50);
    expect(SEO_GOOD_SCORE).toBe(80);
    const poor = computeAeoAudit(makeVenue(), [], []);
    expect(poor.band).toBe("poor");
    const { venue, items, categories } = perfectSetup();
    expect(computeAeoAudit(venue, items, categories).band).toBe("good");
  });

  it("categories drop when nothing in them applies, never showing hollow 100s", () => {
    const report = computeAeoAudit(makeVenue(), [], []);
    // machine's aeo_menu_descriptions is inapplicable with no menu, but the
    // category keeps its other applicable checks — so both categories remain.
    expect(report.categories.map((c) => c.key)).toEqual([
      "answerability",
      "machine",
    ]);
    for (const category of report.categories) {
      expect(category.pct).toBeGreaterThanOrEqual(0);
      expect(category.pct).toBeLessThanOrEqual(100);
    }
  });
});
