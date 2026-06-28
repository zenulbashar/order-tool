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
  | "empty_category"
  | "duplicate_name"
  | "no_name";

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
  /** Items free of any High/Medium issue (the headline "looks fine" count). */
  passingItems: number;
  /** 0–100, severity-weighted (worst issue per item, no stacking). */
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

/**
 * Severity weights for the score. An item's penalty is its WORST issue only
 * (issues do not stack), normalised against the worst possible (high). So an
 * all-photos-missing menu (low) reads ~90, while $0 / no-name / duplicate items
 * (high) pull the score down sharply. Tunable.
 */
const WEIGHT: Record<Severity, number> = { high: 10, medium: 4, low: 1 };

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

  // Duplicate item names: group by normalized name (lower + trim), venue-wide
  // (duplicates can span categories). Pure — no query, no mutation. Blank names
  // are excluded here (they are flagged separately by no_name). Builds the set
  // of affected item ids (for scoring) and the per-name groups (one issue each).
  const categoryNameById = new Map(
    categories.map((category) => [category.id, category.name]),
  );
  const itemsByNormName = new Map<string, MenuItem[]>();
  for (const item of items) {
    const norm = item.name.trim().toLowerCase();
    if (norm.length === 0) continue;
    const list = itemsByNormName.get(norm) ?? [];
    list.push(item);
    itemsByNormName.set(norm, list);
  }
  const duplicateItemIds = new Set<string>();
  for (const group of itemsByNormName.values()) {
    if (group.length >= 2) {
      for (const item of group) duplicateItemIds.add(item.id);
    }
  }

  const criticalIssues: MenuHealthIssue[] = [];
  const advisories: MenuHealthIssue[] = [];
  let passingItems = 0;
  let totalPenalty = 0;

  for (const item of items) {
    const anchor = `item-${item.id}`;
    const title = item.name.trim().length > 0 ? item.name : "(no name)";
    // Track this item's WORST scored-issue weight; the penalty never stacks.
    let worst = 0;
    const flag = (severity: Severity, kind: IssueKind, detail: string) => {
      worst = Math.max(worst, WEIGHT[severity]);
      criticalIssues.push({
        kind,
        severity,
        anchor,
        title,
        detail,
        priceCents: item.priceCents,
      });
    };

    if (item.name.trim().length === 0) {
      flag(
        "high",
        "no_name",
        "This item has no name. Add one so customers know what it is.",
      );
    }

    if (!item.imageUrl || item.imageUrl.trim().length === 0) {
      flag(
        "low",
        "missing_photo",
        "No photo. Items with a photo convert far better.",
      );
    }

    if (item.priceCents === 0) {
      flag("high", "invalid_price", "Price is $0.00, likely a mistake.");
    } else if (item.priceCents < lowBound || item.priceCents > highBound) {
      // Only reachable when the median bounds are active (>= MIN_ITEMS_FOR_OUTLIER).
      flag(
        "low",
        "price_outlier",
        "Price is far outside the rest of your menu, worth a check.",
      );
    }

    if (hasWeakDescription(item.description)) {
      flag(
        "medium",
        "weak_description",
        "Description is missing or very short. Add a tempting line or two.",
      );
    }

    // A duplicate name contributes to this item's worst severity (so the score
    // reflects it), but the row is emitted ONCE per name below, not per item.
    if (duplicateItemIds.has(item.id)) {
      worst = Math.max(worst, WEIGHT.high);
    }

    totalPenalty += worst;
    if (worst <= WEIGHT.low) passingItems += 1; // free of any High/Medium issue

    // Advisory — excluded from the score (hiding an item is a valid choice).
    if (!item.isAvailable) {
      advisories.push({
        kind: "unavailable",
        severity: "low",
        anchor,
        title,
        detail: "Hidden from customers. Remove it or re-enable it?",
        priceCents: item.priceCents,
      });
    }
  }

  // One duplicate_name issue per duplicated name (High, scored): lists the
  // affected categories and deep-links the first affected item. Flag only — the
  // owner fixes it in the editor; nothing here merges, deletes, or renames.
  for (const group of itemsByNormName.values()) {
    if (group.length < 2) continue;
    const cats = [
      ...new Set(
        group
          .map((item) => categoryNameById.get(item.categoryId))
          .filter((name): name is string => Boolean(name)),
      ),
    ];
    const where = cats.length > 0 ? ` (in ${cats.join(", ")})` : "";
    criticalIssues.push({
      kind: "duplicate_name",
      severity: "high",
      anchor: `item-${group[0].id}`,
      title: group[0].name,
      detail: `${group.length} items share this name${where}. Rename or remove the extras so customers and recommendations aren't confused.`,
    });
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
        detail: "No items in this category. Add some or remove it.",
      });
    }
  }

  criticalIssues.sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  );

  // Severity-weighted score: 100 minus the share of the worst-possible penalty
  // (every item at high) the menu actually incurs.
  const score =
    totalItems === 0
      ? 100
      : Math.max(
          0,
          Math.round(100 * (1 - totalPenalty / (totalItems * WEIGHT.high))),
        );
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
