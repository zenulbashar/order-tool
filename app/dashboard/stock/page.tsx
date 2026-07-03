import { asc } from "drizzle-orm";

import { PageHeader } from "@/app/_components/page-header";
import { db } from "@/lib/db";
import { ingredients } from "@/lib/db/schema";
import { dishCost, isCosted, marginOf } from "@/lib/stock/cost";
import { requireUser, requireVenue, scopedToVenue } from "@/lib/tenant";

import {
  getItemsForVenue,
  getRecipeLinesForVenue,
} from "../menu/queries";

import { AddIngredient } from "./add-ingredient";
import { IngredientRow } from "./ingredient-row";

export const dynamic = "force-dynamic";

const FRESH_WINDOW_DAYS = 30;

function Kpi({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-[14px] border border-line bg-surface-elevated p-4 shadow-card">
      <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-label">
        {label}
      </p>
      <p className="mt-1.5 font-display text-2xl font-extrabold text-ink">
        {value}
      </p>
      {sub ? <p className="mt-1 text-[10px] font-semibold text-muted">{sub}</p> : null}
    </div>
  );
}

/**
 * Stock · Ingredients (Track D · D1). The venue's ingredient library with
 * inline add/edit and a computed cost per unit. Overview + Invoices tabs arrive
 * in later Stock builds (D3/D4); shown muted so the design reads right without
 * pretending they work. Owner-side analytics only — no money-path impact.
 */
export default async function StockPage() {
  await requireUser();
  const venue = await requireVenue();

  const [rows, recipeLines, items] = await Promise.all([
    db
      .select()
      .from(ingredients)
      .where(scopedToVenue(ingredients.venueId, venue.id))
      .orderBy(asc(ingredients.name)),
    getRecipeLinesForVenue(venue.id),
    getItemsForVenue(venue.id),
  ]);

  // Average dish margin across items that have BOTH a recipe and a price
  // (D2) — the design's AVG DISH MARGIN. Uncosted lines are excluded from a
  // dish's cost, so the figure is honest for what's costed.
  const linesByItem = new Map<string, typeof recipeLines>();
  for (const line of recipeLines) {
    const list = linesByItem.get(line.menuItemId) ?? [];
    list.push(line);
    linesByItem.set(line.menuItemId, list);
  }
  const margins: number[] = [];
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
    const margin = marginOf(item.priceCents, cost.totalCents);
    if (margin) margins.push(margin.fraction);
  }
  const avgMarginPct =
    margins.length > 0
      ? Math.round(
          (margins.reduce((sum, m) => sum + m, 0) / margins.length) * 100,
        )
      : null;

  const now = new Date().getTime();
  const dayMs = 86_400_000;
  const total = rows.length;
  const packagingCount = rows.filter((row) => row.isPackaging).length;
  const costed = rows.filter((row) => isCosted(row));
  const uncostedCount = total - costed.length;
  const freshCount = costed.filter(
    (row) => (now - row.updatedAt.getTime()) / dayMs < FRESH_WINDOW_DAYS,
  ).length;

  return (
    <main className="mx-auto max-w-5xl">
      <PageHeader title="Stock" description={venue.name} />

      <section className="space-y-4 px-5 py-8">
        {/* Tab bar — Ingredients is live; the others land in later Stock builds. */}
        <div className="inline-flex gap-1 rounded-[10px] bg-sand p-1">
          <span className="rounded-[7px] px-3 py-1.5 text-xs font-semibold text-label">
            Overview
          </span>
          <span className="rounded-[7px] bg-surface-elevated px-3 py-1.5 text-xs font-bold text-ink shadow-sm">
            Ingredients
          </span>
          <span className="rounded-[7px] px-3 py-1.5 text-xs font-semibold text-label">
            Invoices
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Kpi
            label="Ingredients"
            value={String(total)}
            sub={`${packagingCount} are packaging`}
          />
          <Kpi
            label="Costs fresh"
            value={`${freshCount} / ${costed.length}`}
            sub={`Updated in the last ${FRESH_WINDOW_DAYS} days`}
          />
          <Kpi
            label="Avg dish margin"
            value={avgMarginPct === null ? "—" : `${avgMarginPct}%`}
            sub={
              margins.length > 0
                ? `Across ${margins.length} costed ${margins.length === 1 ? "dish" : "dishes"}`
                : `${uncostedCount} uncosted · add recipes in the menu editor`
            }
          />
        </div>

        {total === 0 ? (
          <div className="rounded-card border border-dashed border-line p-8 text-center">
            <p className="text-sm text-muted">
              No ingredients yet. Add your first — a name, pack size and pack
              cost is all it needs, and every recipe cost follows from here.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-card border border-line bg-surface-elevated shadow-card">
            <div className="grid grid-cols-[1.9fr_0.5fr_1.4fr_1.3fr_0.5fr_1.1fr_auto] gap-3 border-b border-line bg-hover-secondary px-4 py-2.5">
              {["Ingredient", "Unit", "Pack", "Cost per unit", "Yield", "Supplier", ""].map(
                (heading, i) => (
                  <span
                    key={heading || i}
                    className="font-mono text-[9px] font-bold uppercase tracking-wider text-label"
                  >
                    {heading}
                  </span>
                ),
              )}
            </div>
            <ul>
              {rows.map((row) => (
                <IngredientRow
                  key={row.id}
                  ingredient={row}
                  ageDays={Math.floor((now - row.updatedAt.getTime()) / dayMs)}
                />
              ))}
            </ul>
          </div>
        )}

        <AddIngredient />

        <p className="text-xs text-muted">
          Cost per unit is computed — pack cost ÷ pack size, adjusted for yield.
          Update it once and every recipe recomputes.
        </p>
      </section>
    </main>
  );
}
