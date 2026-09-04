import { describe, expect, it } from "vitest";

import {
  buildGmbChecklist,
  type GmbChecklistVenue,
  normaliseGmbChecklist,
  toggleGmbChecklistKey,
} from "@/lib/gmb-checklist";

function makeVenue(overrides: Partial<GmbChecklistVenue> = {}): GmbChecklistVenue {
  return {
    slug: "test-cafe",
    streetAddress: null,
    suburb: null,
    postcode: null,
    phone: null,
    openingHours: null,
    logoUrl: null,
    coverUrl: null,
    ...overrides,
  };
}

const URL = "https://prompt2eat.com/test-cafe";

describe("buildGmbChecklist", () => {
  it("derives storefront items from venue data and leaves manual items unticked", () => {
    const empty = buildGmbChecklist(makeVenue(), URL, []);
    expect(empty.done).toBe(0);
    expect(empty.items.filter((item) => item.source === "storefront")).toHaveLength(4);

    const complete = buildGmbChecklist(
      makeVenue({
        streetAddress: "1 Main St",
        suburb: "Brisbane",
        postcode: "4000",
        phone: "07 3000 0000",
        openingHours: [{ day: 0, open: "07:00", close: "15:00" }] as never,
        logoUrl: "https://cdn/logo.png",
        coverUrl: "https://cdn/cover.jpg",
      }),
      URL,
      [],
    );
    expect(complete.done).toBe(4);
    expect(complete.items.find((item) => item.key === "address")?.done).toBe(true);
  });

  it("needs the full address, not just a suburb", () => {
    const partial = buildGmbChecklist(makeVenue({ suburb: "Brisbane" }), URL, []);
    expect(partial.items.find((item) => item.key === "address")?.done).toBe(false);
  });

  it("ticks manual items from the persisted keys and quotes the storefront URL", () => {
    const result = buildGmbChecklist(makeVenue(), URL, ["claimed", "website"]);
    expect(result.items.find((item) => item.key === "claimed")?.done).toBe(true);
    expect(result.items.find((item) => item.key === "website")?.detail).toContain(URL);
    expect(result.done).toBe(2);
  });
});

describe("normaliseGmbChecklist / toggleGmbChecklistKey", () => {
  it("drops unknown and duplicate keys", () => {
    expect(normaliseGmbChecklist(["claimed", "claimed", "address", 42, "nope"])).toEqual([
      "claimed",
    ]);
    expect(normaliseGmbChecklist("claimed")).toEqual([]);
  });

  it("toggles manual keys both ways and refuses storefront keys", () => {
    expect(toggleGmbChecklistKey([], "reviews")).toEqual(["reviews"]);
    expect(toggleGmbChecklistKey(["reviews", "posts"], "reviews")).toEqual(["posts"]);
    expect(toggleGmbChecklistKey([], "address")).toBeNull();
  });
});
