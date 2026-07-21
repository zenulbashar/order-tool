import { describe, expect, it } from "vitest";

import type { InferSelectModel } from "drizzle-orm";

import type { menuCategories, menuItems } from "@/lib/db/schema";
import { computeMenuHealth } from "./menu-health";

type MenuItem = InferSelectModel<typeof menuItems>;
type MenuCategory = InferSelectModel<typeof menuCategories>;

// The report reads only a subset of columns; build minimal rows and cast.
function item(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: "i1",
    categoryId: "c1",
    name: "Margherita",
    description: "Wood-fired with San Marzano tomato and basil.",
    priceCents: 1600,
    imageUrl: "https://img.example/x.jpg",
    isAvailable: true,
    ...overrides,
  } as unknown as MenuItem;
}
function cat(overrides: Partial<MenuCategory> = {}): MenuCategory {
  return { id: "c1", name: "Pizza", ...overrides } as unknown as MenuCategory;
}

describe("computeMenuHealth", () => {
  it("scores an empty menu as 100 but not 'healthy'", () => {
    const r = computeMenuHealth([], []);
    expect(r.score).toBe(100);
    expect(r.hasItems).toBe(false);
    expect(r.isHealthy).toBe(false);
    expect(r.band).toBe("good");
  });

  it("reports a clean single-item menu as healthy", () => {
    const r = computeMenuHealth([item()], [cat()]);
    expect(r.isHealthy).toBe(true);
    expect(r.score).toBe(100);
    expect(r.passingItems).toBe(1);
    expect(r.criticalIssues).toHaveLength(0);
    expect(r.advisories).toHaveLength(0);
  });

  it("flags a $0 price as a high-severity issue and tanks the score", () => {
    const r = computeMenuHealth([item({ priceCents: 0 })], [cat()]);
    expect(r.score).toBe(0);
    expect(r.band).toBe("poor");
    expect(r.passingItems).toBe(0);
    expect(r.criticalIssues.map((i) => i.kind)).toContain("invalid_price");
  });

  it("treats a missing photo as low severity (~90) but still an issue", () => {
    const r = computeMenuHealth([item({ imageUrl: null })], [cat()]);
    expect(r.score).toBe(90); // 1 - 1/10 low penalty
    expect(r.passingItems).toBe(1); // low issues still 'pass'
    expect(r.criticalIssues.map((i) => i.kind)).toEqual(["missing_photo"]);
  });

  it("flags a weak/short description as medium severity", () => {
    const r = computeMenuHealth([item({ description: "yum" })], [cat()]);
    expect(r.score).toBe(60); // 1 - 4/10 medium penalty
    expect(r.band).toBe("ok");
    expect(r.criticalIssues.map((i) => i.kind)).toContain("weak_description");
  });

  it("emits one high-severity duplicate_name issue per shared name", () => {
    const r = computeMenuHealth(
      [item({ id: "a", name: "Fries" }), item({ id: "b", name: "fries " })],
      [cat()],
    );
    const dupes = r.criticalIssues.filter((i) => i.kind === "duplicate_name");
    expect(dupes).toHaveLength(1);
    expect(dupes[0].severity).toBe("high");
    expect(r.score).toBe(0); // both items carry the high penalty
  });

  it("routes hidden items and empty categories to advisories (off-score)", () => {
    const r = computeMenuHealth(
      [item({ isAvailable: false })],
      [cat(), cat({ id: "c2", name: "Empty" })],
    );
    const kinds = r.advisories.map((a) => a.kind).sort();
    expect(kinds).toEqual(["empty_category", "unavailable"]);
    // Advisories don't affect the score — the item itself is otherwise clean.
    expect(r.score).toBe(100);
  });

  it("flags a price outlier only once there are enough priced items for a median", () => {
    const base = Array.from({ length: 5 }, (_, i) =>
      item({ id: `p${i}`, priceCents: 1000 }),
    );
    const outlier = item({ id: "out", priceCents: 100000 });
    const r = computeMenuHealth([...base, outlier], [cat()]);
    expect(r.criticalIssues.map((i) => i.kind)).toContain("price_outlier");
  });
});
