import Link from "next/link";
import { and, asc, desc, eq, gt, sql } from "drizzle-orm";

import { PageHeader } from "@/app/_components/page-header";
import { cx } from "@/app/_components/cx";
import { db } from "@/lib/db";
import { ingredients, stockMovements } from "@/lib/db/schema";
import { costPerUnitCents, isLowStock } from "@/lib/stock/cost";
import { requireUser, requireVenue, scopedToVenue } from "@/lib/tenant";
import { formatCents } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** Window over which consumption run-rate is measured. */
const USAGE_WINDOW_DAYS = 30;

const REASON_LABEL: Record<string, string> = {
  opening: "Opening count",
  receiving: "Received",
  adjustment: "Adjusted",
  wastage: "Wastage",
  stocktake: "Stocktake",
  depletion: "Sold",
};

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

/** Compact quantity: whole numbers bare, otherwise up to 2 dp. */
function formatQty(qty: number): string {
  return Number.isInteger(qty) ? String(qty) : qty.toFixed(2).replace(/\.?0+$/, "");
}

/** Days-of-cover phrasing from a fractional day count. */
function coverLabel(days: number | null): string {
  if (days === null) return "—";
  if (days < 1) return "< 1 day";
  const rounded = Math.round(days);
  return `${rounded} day${rounded === 1 ? "" : "s"}`;
}

/**
 * Stock · Overview (Track D · D4c). The perpetual-inventory read surface: live
 * on-hand value, low-stock triage, and consumption run-rate + days-of-cover, all
 * derived from the stock ledger (D4a) fed by order depletion (D4b). Read-only
 * owner analytics — no writes, no money-path involvement.
 */
export default async function StockOverviewPage() {
  await requireUser();
  const venue = await requireVenue();

  const since = new Date(new Date().getTime() - USAGE_WINDOW_DAYS * 86_400_000);

  const [rows, usage, recent] = await Promise.all([
    db
      .select()
      .from(ingredients)
      .where(scopedToVenue(ingredients.venueId, venue.id))
      .orderBy(asc(ingredients.name)),
    // Consumption per ingredient over the window — sum of depletion deltas
    // (negative), flipped to a positive quantity consumed.
    db
      .select({
        ingredientId: stockMovements.ingredientId,
        consumed: sql<number>`-coalesce(sum(${stockMovements.deltaQty}), 0)`,
      })
      .from(stockMovements)
      .where(
        and(
          scopedToVenue(stockMovements.venueId, venue.id),
          eq(stockMovements.reason, "depletion"),
          gt(stockMovements.createdAt, since),
        ),
      )
      .groupBy(stockMovements.ingredientId),
    // Recent ledger activity for the feed.
    db
      .select({
        id: stockMovements.id,
        ingredientName: ingredients.name,
        unit: ingredients.unit,
        deltaQty: stockMovements.deltaQty,
        reason: stockMovements.reason,
        createdAt: stockMovements.createdAt,
      })
      .from(stockMovements)
      .innerJoin(ingredients, eq(ingredients.id, stockMovements.ingredientId))
      .where(scopedToVenue(stockMovements.venueId, venue.id))
      .orderBy(desc(stockMovements.createdAt))
      .limit(12),
  ]);

  const consumedById = new Map(usage.map((u) => [u.ingredientId, Number(u.consumed)]));

  // Per-ingredient derived metrics.
  const metrics = rows.map((row) => {
    const unitCost = costPerUnitCents(row);
    const consumed = consumedById.get(row.id) ?? 0;
    const dailyRate = consumed / USAGE_WINDOW_DAYS;
    const daysCover =
      dailyRate > 0 && row.onHandQty != null ? row.onHandQty / dailyRate : null;
    const valueCents =
      row.onHandQty != null && unitCost != null ? row.onHandQty * unitCost : null;
    const usageCostCents = unitCost != null ? consumed * unitCost : null;
    return {
      row,
      unitCost,
      consumed,
      dailyRate,
      daysCover,
      valueCents,
      usageCostCents,
      low: isLowStock(row),
      out: row.onHandQty != null && row.onHandQty <= 0,
    };
  });

  const trackedCount = rows.filter((row) => row.onHandQty != null).length;
  const lowCount = metrics.filter((m) => m.low).length;
  const inventoryValueCents = metrics.reduce(
    (sum, m) => sum + (m.valueCents ?? 0),
    0,
  );
  const usageCostCents = metrics.reduce(
    (sum, m) => sum + (m.usageCostCents ?? 0),
    0,
  );

  // Triage: anything low or out, most urgent (fewest days of cover) first.
  const attention = metrics
    .filter((m) => m.low || m.out)
    .sort((a, b) => {
      const av = a.daysCover ?? Infinity;
      const bv = b.daysCover ?? Infinity;
      return av - bv;
    });

  // Top movers by cost of goods consumed in the window.
  const movers = metrics
    .filter((m) => m.consumed > 0)
    .sort((a, b) => (b.usageCostCents ?? 0) - (a.usageCostCents ?? 0))
    .slice(0, 8);

  const hasLedger = trackedCount > 0 || recent.length > 0;

  return (
    <main className="mx-auto w-full max-w-[1600px]">
      <PageHeader
        title="Stock"
        description={venue.name}
        action={
          <Link
            href="/dashboard/stock/scan"
            className="inline-flex items-center gap-1.5 rounded-control bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-forest transition hover:opacity-90"
          >
            <span aria-hidden="true">✦</span> Scan invoice
          </Link>
        }
      />

      <section className="space-y-4 px-5 py-8">
        {/* Tab bar — Overview is live here; Ingredients + Invoices link out. */}
        <div className="inline-flex gap-1 rounded-[10px] bg-sand p-1">
          <span className="rounded-[7px] bg-surface-elevated px-3 py-1.5 text-xs font-bold text-ink shadow-sm">
            Overview
          </span>
          <Link
            href="/dashboard/stock"
            className="rounded-[7px] px-3 py-1.5 text-xs font-semibold text-label transition hover:text-ink"
          >
            Ingredients
          </Link>
          <Link
            href="/dashboard/stock/scan"
            className="rounded-[7px] px-3 py-1.5 text-xs font-semibold text-label transition hover:text-ink"
          >
            Invoices
          </Link>
          <Link
            href="/dashboard/stock/suggestions"
            className="rounded-[7px] px-3 py-1.5 text-xs font-semibold text-label transition hover:text-ink"
          >
            Suggestions
          </Link>
        </div>

        {!hasLedger ? (
          <div className="rounded-card border border-dashed border-line p-8 text-center">
            <p className="text-sm text-muted">
              No stock activity yet. Set opening counts on the{" "}
              <Link href="/dashboard/stock" className="font-semibold text-[var(--action)] hover:opacity-80">
                Ingredients
              </Link>{" "}
              tab, and stock depletes automatically as orders come in — usage,
              days of cover and low-stock alerts appear here.
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi
                label="Tracked"
                value={String(trackedCount)}
                sub={`of ${rows.length} ingredients`}
              />
              <Kpi
                label="Low stock"
                value={String(lowCount)}
                sub={lowCount > 0 ? "Below par — reorder" : "All above par"}
              />
              <Kpi
                label="Inventory value"
                value={`$${formatCents(Math.round(inventoryValueCents))}`}
                sub="On-hand at pack cost"
              />
              <Kpi
                label={`Used · ${USAGE_WINDOW_DAYS}d`}
                value={`$${formatCents(Math.round(usageCostCents))}`}
                sub="Cost of stock sold"
              />
            </div>

            {/* Needs attention — low / out of stock, most urgent first. */}
            <div className="overflow-hidden rounded-card border border-line bg-surface-elevated shadow-card">
              <div className="flex items-center justify-between border-b border-line bg-hover-secondary px-4 py-2.5">
                <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-label">
                  Needs attention
                </p>
                <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-label">
                  Days of cover
                </p>
              </div>
              {attention.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted">
                  Nothing low — every tracked ingredient is above its par level.
                </p>
              ) : (
                <ul>
                  {attention.map((m) => (
                    <li
                      key={m.row.id}
                      className="flex items-center justify-between gap-3 border-b border-line/60 px-4 py-3 last:border-0"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm font-bold text-ink">
                          {m.row.name}
                        </span>
                        {m.out ? (
                          <span className="rounded-[5px] bg-error/15 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wide text-error">
                            Out
                          </span>
                        ) : (
                          <span className="rounded-[5px] bg-warm/15 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wide text-warm-deep">
                            Low
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-4">
                        <span className="font-mono text-[11px] text-muted">
                          {m.row.onHandQty == null
                            ? "—"
                            : `${formatQty(m.row.onHandQty)}`}
                          {m.row.parLevel != null
                            ? ` / ${formatQty(m.row.parLevel)}`
                            : ""}{" "}
                          {m.row.unit}
                        </span>
                        <span
                          className={cx(
                            "w-16 text-right font-display text-[13px] font-extrabold",
                            m.daysCover !== null && m.daysCover < 3
                              ? "text-warm-deep"
                              : "text-ink",
                          )}
                        >
                          {coverLabel(m.daysCover)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Top movers by cost consumed. */}
            {movers.length > 0 ? (
              <div className="overflow-hidden rounded-card border border-line bg-surface-elevated shadow-card">
                <div className="grid grid-cols-[1.8fr_1fr_1fr_1fr] gap-3 border-b border-line bg-hover-secondary px-4 py-2.5">
                  {["Top movers", `Used · ${USAGE_WINDOW_DAYS}d`, "Per day", "Cost"].map(
                    (h) => (
                      <span
                        key={h}
                        className="font-mono text-[9px] font-bold uppercase tracking-wider text-label last:text-right"
                      >
                        {h}
                      </span>
                    ),
                  )}
                </div>
                <ul>
                  {movers.map((m) => (
                    <li
                      key={m.row.id}
                      className="grid grid-cols-[1.8fr_1fr_1fr_1fr] items-center gap-3 border-b border-line/60 px-4 py-3 last:border-0 text-sm"
                    >
                      <span className="truncate font-bold text-ink">
                        {m.row.name}
                      </span>
                      <span className="font-mono text-[11px] text-muted">
                        {formatQty(Math.round(m.consumed * 100) / 100)} {m.row.unit}
                      </span>
                      <span className="font-mono text-[11px] text-muted">
                        {formatQty(Math.round(m.dailyRate * 100) / 100)} {m.row.unit}
                      </span>
                      <span className="text-right font-display text-[13px] font-extrabold text-ink">
                        {m.usageCostCents == null
                          ? "—"
                          : `$${formatCents(Math.round(m.usageCostCents))}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Recent ledger activity. */}
            {recent.length > 0 ? (
              <div className="rounded-card border border-line bg-surface-elevated p-4 shadow-card">
                <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-label">
                  Recent activity
                </p>
                <ul className="mt-3 space-y-2">
                  {recent.map((mv) => {
                    const positive = mv.deltaQty > 0;
                    return (
                      <li
                        key={mv.id}
                        className="flex items-center justify-between gap-3 border-b border-line/60 pb-2 last:border-0 last:pb-0 text-sm"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate font-medium text-ink">
                            {mv.ingredientName}
                          </span>
                          <span className="shrink-0 rounded-[5px] bg-sand px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider text-muted">
                            {REASON_LABEL[mv.reason] ?? mv.reason}
                          </span>
                        </span>
                        <span
                          className={cx(
                            "shrink-0 font-mono text-[11px] font-bold",
                            positive ? "text-success-deep" : "text-muted",
                          )}
                        >
                          {positive ? "+" : ""}
                          {formatQty(mv.deltaQty)} {mv.unit}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            <p className="text-xs text-muted">
              On-hand depletes automatically as orders are confirmed. Days of
              cover uses the last {USAGE_WINDOW_DAYS} days of sales — set opening
              counts and par levels on the Ingredients tab to sharpen it.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
