import "server-only";

import { and, eq, gt } from "drizzle-orm";

import { db } from "@/lib/db";
import { ingredients, menuItems, nudges, recipeLines } from "@/lib/db/schema";
import { dishCost, isCosted, isLowStock, marginOf } from "@/lib/stock/cost";
import { scopedToVenue } from "@/lib/tenant";

/**
 * The Suggestions inbox (Track D · D5). Every suggestion is DERIVED LIVE from
 * current venue state — low/out stock, stale costs, uncosted ingredients on live
 * dishes, thin-margin dishes — so the inbox is always honest and self-clearing:
 * fix the underlying thing and the suggestion disappears on its own. Nothing is
 * generated ahead of time or stored; only the owner's dismissals persist (the
 * `nudges` table), and those expire so a recurring condition can resurface.
 * Read-only analytics — no order money-path involvement.
 */

/** How long a dismissal suppresses a suggestion before it can resurface. */
const DISMISS_COOLDOWN_DAYS = 30;
/** A cost is "stale" once its ingredient hasn't been touched in this long. */
const STALE_COST_DAYS = 60;
/** Dishes below this margin are flagged (matches the recipe editor's target). */
const TARGET_MARGIN = 0.65;

export type SuggestionKind =
  | "reorder"
  | "stale_cost"
  | "uncosted"
  | "thin_margin";

export type Severity = "high" | "medium" | "low";

export type Suggestion = {
  dedupeKey: string;
  kind: SuggestionKind;
  severity: Severity;
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
};

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

/** Days between two dates, floored. */
function daysBetween(now: number, then: Date): number {
  return Math.floor((now - then.getTime()) / 86_400_000);
}

export async function buildSuggestions(venueId: string): Promise<Suggestion[]> {
  const now = new Date().getTime();
  const cooldownSince = new Date(now - DISMISS_COOLDOWN_DAYS * 86_400_000);

  const [rows, recipes, items, dismissed] = await Promise.all([
    db
      .select()
      .from(ingredients)
      .where(scopedToVenue(ingredients.venueId, venueId)),
    db
      .select({
        menuItemId: recipeLines.menuItemId,
        ingredientId: recipeLines.ingredientId,
        qty: recipeLines.qty,
        packSize: ingredients.packSize,
        packCostCents: ingredients.packCostCents,
        yieldPct: ingredients.yieldPct,
      })
      .from(recipeLines)
      .innerJoin(ingredients, eq(ingredients.id, recipeLines.ingredientId))
      .where(scopedToVenue(recipeLines.venueId, venueId)),
    db
      .select({ id: menuItems.id, name: menuItems.name, priceCents: menuItems.priceCents })
      .from(menuItems)
      .where(scopedToVenue(menuItems.venueId, venueId)),
    // Dismissals still inside their cooldown window.
    db
      .select({ dedupeKey: nudges.dedupeKey })
      .from(nudges)
      .where(
        and(
          scopedToVenue(nudges.venueId, venueId),
          gt(nudges.createdAt, cooldownSince),
        ),
      ),
  ]);

  const suppressed = new Set(dismissed.map((d) => d.dedupeKey));
  const suggestions: Suggestion[] = [];

  // How many distinct dishes each ingredient appears in (for the uncosted copy).
  const dishesByIngredient = new Map<string, Set<string>>();
  const linesByItem = new Map<string, typeof recipes>();
  for (const line of recipes) {
    const set = dishesByIngredient.get(line.ingredientId) ?? new Set<string>();
    set.add(line.menuItemId);
    dishesByIngredient.set(line.ingredientId, set);
    const list = linesByItem.get(line.menuItemId) ?? [];
    list.push(line);
    linesByItem.set(line.menuItemId, list);
  }

  for (const row of rows) {
    // Reorder — low or out of stock.
    const out = row.onHandQty != null && row.onHandQty <= 0;
    if (out || isLowStock(row)) {
      suggestions.push({
        dedupeKey: `reorder:${row.id}`,
        kind: "reorder",
        severity: out ? "high" : "medium",
        title: `Reorder ${row.name}`,
        detail: out
          ? `Out of stock${row.parLevel != null ? ` · par ${row.parLevel} ${row.unit}` : ""}.`
          : `${row.onHandQty} ${row.unit} left · par ${row.parLevel} ${row.unit}.`,
        href: "/dashboard/stock",
        actionLabel: "Update stock",
      });
    }

    // Uncosted ingredient that a dish actually uses.
    const dishCount = dishesByIngredient.get(row.id)?.size ?? 0;
    if (!isCosted(row) && dishCount > 0) {
      suggestions.push({
        dedupeKey: `uncosted:${row.id}`,
        kind: "uncosted",
        severity: "medium",
        title: `Set a pack cost for ${row.name}`,
        detail: `Used in ${dishCount} ${dishCount === 1 ? "dish" : "dishes"} — their cost is incomplete until it's priced.`,
        href: "/dashboard/stock",
        actionLabel: "Add cost",
      });
    }

    // Stale cost — costed but not touched in a while.
    if (isCosted(row)) {
      const age = daysBetween(now, row.updatedAt);
      if (age >= STALE_COST_DAYS) {
        suggestions.push({
          dedupeKey: `stale_cost:${row.id}`,
          kind: "stale_cost",
          severity: "low",
          title: `Refresh ${row.name}'s cost`,
          detail: `Pack cost last updated ${age} days ago — check it's still right.`,
          href: "/dashboard/stock",
          actionLabel: "Review cost",
        });
      }
    }
  }

  // Thin-margin dishes — fully costed recipe whose margin is below target.
  for (const item of items) {
    const itemLines = linesByItem.get(item.id);
    if (!itemLines || itemLines.length === 0) continue;
    const cost = dishCost(
      itemLines.map((line) => ({
        qty: line.qty,
        ingredient: {
          packSize: line.packSize,
          packCostCents: line.packCostCents,
          yieldPct: line.yieldPct,
        },
      })),
    );
    // Only judge margin when the recipe is fully costed — otherwise it's noise.
    if (cost.uncostedLines > 0) continue;
    const margin = marginOf(item.priceCents, cost.totalCents);
    if (!margin || margin.fraction >= TARGET_MARGIN) continue;
    const pct = Math.round(margin.fraction * 100);
    suggestions.push({
      dedupeKey: `thin_margin:${item.id}`,
      kind: "thin_margin",
      severity: margin.fraction < 0.5 ? "high" : "medium",
      title: `${item.name} margin is ${pct}%`,
      detail: `Below the ${Math.round(TARGET_MARGIN * 100)}% target — reprice or trim the recipe.`,
      href: `/dashboard/menu?item=${item.id}`,
      actionLabel: "Open dish",
    });
  }

  return suggestions
    .filter((s) => !suppressed.has(s.dedupeKey))
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

/**
 * Persist a dismissal (upsert — re-dismissing refreshes the cooldown). Venue-
 * scoped by the caller; the write carries the venue id so a forged key lands on
 * the acting venue only.
 */
export async function dismissNudge(
  venueId: string,
  dedupeKey: string,
): Promise<void> {
  await db
    .insert(nudges)
    .values({ venueId, dedupeKey })
    .onConflictDoUpdate({
      target: [nudges.venueId, nudges.dedupeKey],
      set: { createdAt: new Date() },
    });
}
