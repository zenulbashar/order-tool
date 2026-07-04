import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, gt, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { customers, orders, venues } from "@/lib/db/schema";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { computeApplicationFeeCents } from "@/lib/stripe";
import { formatCents } from "@/lib/validation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Platform stats" };

const WINDOW_DAYS = 30;
const TREND_DAYS = 14;

const eyebrow = "font-mono text-[9px] font-bold uppercase tracking-wider text-label";

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-[14px] border border-line bg-surface-elevated p-4 shadow-card">
      <p className={eyebrow}>{label}</p>
      <p className="mt-1.5 font-display text-2xl font-extrabold text-ink">{value}</p>
      {sub ? <p className="mt-1 text-[10px] font-semibold text-muted">{sub}</p> : null}
    </div>
  );
}

/** Horizontal bar row (share of a max). Pure CSS width — no chart lib. */
function BarRow({ label, value, max, display }: { label: string; value: number; max: number; display: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-28 shrink-0 truncate text-xs font-medium text-ink">{label}</span>
      <span className="h-3 flex-1 overflow-hidden rounded-pill bg-line">
        <span className="block h-full rounded-pill bg-[var(--color-accent)]" style={{ width: `${pct}%` }} />
      </span>
      <span className="w-16 shrink-0 text-right font-mono text-[11px] text-muted">{display}</span>
    </div>
  );
}

/**
 * Platform BI dashboard (Track E2a). Operator-gated read-only analytics: fleet
 * KPIs, a daily orders trend, plan mix, top venues, and top/bottom customers by
 * spend. Cross-tenant reads are intentional and confined to this admin route.
 * NOTE ON "profitability": true margin needs recipe COGS (the Stock suite),
 * which most venues don't have platform-wide — so customers are ranked by SPEND
 * and labelled as such, never presented as profit we can't compute.
 */
export default async function PlatformStatsPage() {
  await requirePlatformAdmin();

  const now = new Date().getTime();
  const since = new Date(now - WINDOW_DAYS * 86_400_000);
  const dayMs = 86_400_000;

  const [venueRows, orderRows] = await Promise.all([
    db
      .select({
        id: venues.id,
        name: venues.name,
        plan: venues.plan,
        isLive: venues.onboardingCompletedAt,
      })
      .from(venues),
    db
      .select({
        venueId: orders.venueId,
        customerId: orders.customerId,
        totalCents: orders.totalCents,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(and(eq(orders.status, "confirmed"), gt(orders.createdAt, since))),
  ]);

  // Fleet KPIs.
  const liveCount = venueRows.filter((v) => v.isLive !== null).length;
  const payingCount = venueRows.filter((v) => v.plan === "pro" || v.plan === "scale").length;
  const gmv = orderRows.reduce((sum, o) => sum + o.totalCents, 0);
  const platformRevenue = orderRows.reduce(
    (sum, o) => sum + computeApplicationFeeCents(o.totalCents),
    0,
  );

  // Daily orders trend (last TREND_DAYS).
  const trend: { label: string; count: number }[] = [];
  for (let d = TREND_DAYS - 1; d >= 0; d -= 1) {
    const dayStart = now - d * dayMs;
    const label = new Date(dayStart).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
    const count = orderRows.filter(
      (o) => o.createdAt.getTime() >= dayStart - dayMs && o.createdAt.getTime() < dayStart,
    ).length;
    trend.push({ label, count });
  }
  const trendMax = Math.max(1, ...trend.map((t) => t.count));

  // Plan mix.
  const planMix = new Map<string, number>();
  for (const v of venueRows) planMix.set(v.plan, (planMix.get(v.plan) ?? 0) + 1);
  const planRows = [...planMix.entries()].sort((a, b) => b[1] - a[1]);
  const planMax = Math.max(1, ...planRows.map((r) => r[1]));

  // Top venues by GMV.
  const venueName = new Map(venueRows.map((v) => [v.id, v.name]));
  const gmvByVenue = new Map<string, number>();
  for (const o of orderRows) gmvByVenue.set(o.venueId, (gmvByVenue.get(o.venueId) ?? 0) + o.totalCents);
  const topVenues = [...gmvByVenue.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const topVenueMax = Math.max(1, ...topVenues.map((r) => r[1]));

  // Customers by spend — top 3 and bottom 3 (among those who ordered).
  const spendByCustomer = new Map<string, { gmv: number; orders: number }>();
  for (const o of orderRows) {
    if (!o.customerId) continue;
    const cur = spendByCustomer.get(o.customerId) ?? { gmv: 0, orders: 0 };
    cur.gmv += o.totalCents;
    cur.orders += 1;
    spendByCustomer.set(o.customerId, cur);
  }
  const rankedCustomers = [...spendByCustomer.entries()].sort((a, b) => b[1].gmv - a[1].gmv);
  const topCustomers = rankedCustomers.slice(0, 3);
  const bottomCustomers = rankedCustomers.length > 3 ? rankedCustomers.slice(-3).reverse() : [];

  const custIds = [...new Set([...topCustomers, ...bottomCustomers].map(([id]) => id))];
  const custRows = custIds.length
    ? await db
        .select({ id: customers.id, email: customers.email, name: customers.name, venueId: customers.venueId })
        .from(customers)
        .where(inArray(customers.id, custIds))
    : [];
  const custById = new Map(custRows.map((c) => [c.id, c]));

  function customerLine(id: string, agg: { gmv: number; orders: number }) {
    const c = custById.get(id);
    const who = c?.name ?? c?.email ?? "Customer";
    const venue = c ? venueName.get(c.venueId) ?? "" : "";
    return (
      <li key={id} className="flex items-center justify-between gap-3 border-b border-line/60 py-2 last:border-0">
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-ink">{who}</span>
          <span className="font-mono text-[10px] text-muted">
            {venue} · {agg.orders} order{agg.orders === 1 ? "" : "s"}
          </span>
        </span>
        <span className="shrink-0 font-display text-[13px] font-extrabold text-ink">
          ${formatCents(agg.gmv)}
        </span>
      </li>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <header className="mb-6">
        <Link href="/admin" className="text-xs font-medium text-[var(--action)] hover:opacity-80">
          ← Admin
        </Link>
        <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-ink">
          Platform stats
        </h1>
        <p className="mt-1 text-sm text-muted">Last {WINDOW_DAYS} days · confirmed orders</p>
      </header>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Venues" value={String(venueRows.length)} sub={`${liveCount} live · ${payingCount} paying`} />
        <Kpi label="Orders" value={String(orderRows.length)} sub={`Last ${WINDOW_DAYS} days`} />
        <Kpi label="GMV" value={`$${formatCents(gmv)}`} sub="Confirmed order value" />
        <Kpi label="Platform revenue" value={`$${formatCents(platformRevenue)}`} sub="Application fees" />
      </div>

      {/* Orders trend */}
      <section className="mb-6 rounded-card border border-line bg-surface-elevated p-5 shadow-card">
        <p className={eyebrow}>Orders · last {TREND_DAYS} days</p>
        <div className="mt-4 flex h-40 items-end gap-1.5">
          {trend.map((t, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
              <div
                className="w-full rounded-t-[3px] bg-[var(--color-accent)] transition-all"
                style={{ height: `${Math.max(3, (t.count / trendMax) * 100)}%` }}
                title={`${t.label}: ${t.count}`}
              />
              <span className="font-mono text-[8px] text-muted">{t.count}</span>
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between font-mono text-[8px] text-muted">
          <span>{trend[0]?.label}</span>
          <span>{trend[trend.length - 1]?.label}</span>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-card border border-line bg-surface-elevated p-5 shadow-card">
          <p className={eyebrow}>Plan mix</p>
          <div className="mt-3">
            {planRows.map(([plan, cnt]) => (
              <BarRow key={plan} label={plan} value={cnt} max={planMax} display={String(cnt)} />
            ))}
          </div>
        </section>

        <section className="rounded-card border border-line bg-surface-elevated p-5 shadow-card">
          <p className={eyebrow}>Top venues · GMV</p>
          <div className="mt-3">
            {topVenues.length === 0 ? (
              <p className="text-sm text-muted">No orders in the window.</p>
            ) : (
              topVenues.map(([id, v]) => (
                <BarRow
                  key={id}
                  label={venueName.get(id) ?? id}
                  value={v}
                  max={topVenueMax}
                  display={`$${formatCents(v)}`}
                />
              ))
            )}
          </div>
        </section>

        <section className="rounded-card border border-line bg-surface-elevated p-5 shadow-card">
          <p className={eyebrow}>Top customers · by spend</p>
          {topCustomers.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No customer-linked orders yet.</p>
          ) : (
            <ul className="mt-2">{topCustomers.map(([id, agg]) => customerLine(id, agg))}</ul>
          )}
        </section>

        <section className="rounded-card border border-line bg-surface-elevated p-5 shadow-card">
          <p className={eyebrow}>Lowest-spend customers</p>
          {bottomCustomers.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Not enough customers to rank.</p>
          ) : (
            <ul className="mt-2">{bottomCustomers.map(([id, agg]) => customerLine(id, agg))}</ul>
          )}
        </section>
      </div>

      <p className="mt-4 text-xs text-muted">
        Customers are ranked by spend (order value). True profitability needs
        ingredient costs from the Stock suite, which not every venue has — so
        this shows revenue, not margin, and reads across every venue&apos;s
        customers (operators only).
      </p>
    </main>
  );
}
