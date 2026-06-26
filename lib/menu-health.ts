import type { InferSelectModel } from "drizzle-orm";

import type { menuCategories, menuItems } from "@/lib/db/schema";

/* -------------------------------------------------------------------------- */
/*  Menu health — pure, read-only computation                                  */
/*                                                                            */
/*  Computes an owner-facing "menu health" report from the venue's EXISTING    */
/*  menu data. This module is intentionally pure: it touches NO database, NO   */
/*  env, and NO AI. It is fed the item/category lists the dashboard already    */
/*  loads (getItemsForVenue / getCategoriesForVenue — both venue-scoped), so   */
/*  the report can only ever reflect the selected venue and nothing crosses    */
/*  tenants. It never writes or suggests an action it performs itself; the     */
/*  panel that renders this only links back to the editor.                     */
/* -------------------------------------------------------------------------- */

type MenuItem = InferSelectModel<typeof menuItems>;
type MenuCategory = InferSelectModel<typeof menuCategories>;

/** Descriptions shorter than this (after trimming) read as weak/placeholder. */
export const WEAK_DESCRIPTION_MIN_CHARS = 20;
/** A priced item is an outlier if it is this many times above/below median. */
export const OUTLIER_FACTOR = 4;
/** Below this many priced items the median is too noisy to trust — skip it. */
export const MIN_ITEMS_FOR_OUTLIER = 5;
/** Score at/above this is "good" (green); at/above OK_SCORE is "ok" (amber). */
export const GOOD_SCORE = 80;
export const OK_SCORE = 50;

export type IssueKind =
  | "missing_photo"
  | "weak_description"
  | "invalid_price"
  | "price_outlier"
  | "unavailable"
  | "empty_category";

export type Severity = "high" | "medium" | "low";

export interface MenuHealthIssue {
  kind: IssueKind;
  severity: Severity;
  /** Anchor on the menu page to jump to (e.g. "item-<id>" / "category-<id>"). */
  anchor: string;
  /** Name of the item/category the issue is about. */
  title: string;
  /** One-line, human explanation of the gap. */
  detail: string;
  /** Item price in cents, when the row is an item (for display in the list). */
  priceCents?: number;
}

export type HealthBand = "good" | "ok" | "poor";

export interface MenuHealthReport {
  hasItems: boolean;
  totalItems: number;
  /** Items passing all four conversion-critical checks. */
  passingItems: number;
  /** 0–100, the percentage of items with no conversion-critical issue. */
  score: number;
  band: HealthBand;
  /** Conversion-critical issues, sorted by severity (high first). */
  criticalIssues: MenuHealthIssue[];
  /** Lower-stakes advisories (often legitimate choices); excluded from score. */
  advisories: MenuHealthIssue[];
  /** True when there are items and no issues at all — the "looks great" state. */
  isHealthy: boolean;
}

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

/** Median of a non-empty numeric list. Caller guarantees length > 0. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function hasWeakDescription(description: string | null): boolean {
  return (description?.trim().length ?? 0) < WEAK_DESCRIPTION_MIN_CHARS;
}

/**
 * Compute the menu health report for a venue from its already-loaded,
 * venue-scoped item and category lists. Pure — no I/O.
 */
export function computeMenuHealth(
  items: MenuItem[],
  categories: MenuCategory[],
): MenuHealthReport {
  const totalItems = items.length;

  // Price-outlier bounds, derived from the venue's OWN priced items so the
  // heuristic is relative and transparent. Skipped entirely when there are too
  // few priced items for a median to mean anything.
  const pricedValues = items
    .map((item) => item.priceCents)
    .filter((cents) => cents > 0);
  let lowBound = -Infinity;
  let highBound = Infinity;
  if (pricedValues.length >= MIN_ITEMS_FOR_OUTLIER) {
    const mid = median(pricedValues);
    lowBound = mid / OUTLIER_FACTOR;
    highBound = mid * OUTLIER_FACTOR;
  }

  const criticalIssues: MenuHealthIssue[] = [];
  const advisories: MenuHealthIssue[] = [];
  let passingItems = 0;

  for (const item of items) {
    const anchor = `item-${item.id}`;
    let passes = true;

    if (!item.imageUrl || item.imageUrl.trim().length === 0) {
      passes = false;
      criticalIssues.push({
        kind: "missing_photo",
        severity: "high",
        anchor,
        title: item.name,
        detail: "No photo — items with a photo convert far better.",
        priceCents: item.priceCents,
      });
    }

    if (item.priceCents === 0) {
      passes = false;
      criticalIssues.push({
        kind: "invalid_price",
        severity: "high",
        anchor,
        title: item.name,
        detail: "Price is $0.00 — likely a mistake.",
        priceCents: item.priceCents,
      });
    } else if (item.priceCents < lowBound || item.priceCents > highBound) {
      // Only reachable when the median bounds are active (>= MIN_ITEMS_FOR_OUTLIER).
      passes = false;
      criticalIssues.push({
        kind: "price_outlier",
        severity: "low",
        anchor,
        title: item.name,
        detail: "Price is far outside the rest of your menu — worth a check.",
        priceCents: item.priceCents,
      });
    }

    if (hasWeakDescription(item.description)) {
      passes = false;
      criticalIssues.push({
        kind: "weak_description",
        severity: "medium",
        anchor,
        title: item.name,
        detail:
          "Description is missing or very short — add a tempting line or two.",
        priceCents: item.priceCents,
      });
    }

    if (passes) passingItems += 1;

    // Advisory — excluded from the score (hiding an item is a valid choice).
    if (!item.isAvailable) {
      advisories.push({
        kind: "unavailable",
        severity: "low",
        anchor,
        title: item.name,
        detail: "Hidden from customers — remove it or re-enable it?",
        priceCents: item.priceCents,
      });
    }
  }

  // Advisory — categories with no items look broken on the storefront.
  const itemCountByCategory = new Map<string, number>();
  for (const item of items) {
    itemCountByCategory.set(
      item.categoryId,
      (itemCountByCategory.get(item.categoryId) ?? 0) + 1,
    );
  }
  for (const category of categories) {
    if ((itemCountByCategory.get(category.id) ?? 0) === 0) {
      advisories.push({
        kind: "empty_category",
        severity: "low",
        anchor: `category-${category.id}`,
        title: category.name,
        detail: "No items in this category — add some or remove it.",
      });
    }
  }

  criticalIssues.sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  );

  const score =
    totalItems === 0 ? 100 : Math.round((passingItems / totalItems) * 100);
  const band: HealthBand =
    score >= GOOD_SCORE ? "good" : score >= OK_SCORE ? "ok" : "poor";

  return {
    hasItems: totalItems > 0,
    totalItems,
    passingItems,
    score,
    band,
    criticalIssues,
    advisories,
    isHealthy:
      totalItems > 0 &&
      criticalIssues.length === 0 &&
      advisories.length === 0,
  };
}
