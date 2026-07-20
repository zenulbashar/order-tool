import type { Metadata } from "next";
import { and, eq, gt } from "drizzle-orm";

import { PageHeader } from "@/app/_components/page-header";
import { db } from "@/lib/db";
import { orderItems, orders } from "@/lib/db/schema";
import { getVenuePointsOutstanding } from "@/lib/loyalty/balance";
import { requireUser, requireVenue, scopedToVenue } from "@/lib/tenant";
import { formatCents } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reports" };

const WINDOW_DAYS = 30;
const TREND_DAYS = 14;

const eyebrow =
  "font-mono text-[9px] font-bold uppercase tracking-wider text-label";

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
function BarRow({
  label,
  value,
  max,
  display,
}: {
  label: string;
  value: number;
  max: number;
  display: string;
}) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-32 shrink-0 truncate text-xs font-medium text-ink">
        {label}
      </span>
      <span className="h-3 flex-1 overflow-hidden rounded-pill bg-line">
        <span
          className="block h-full rounded-pill bg-[var(--color-accent)]"
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="w-16 shrink-0 text-right font-mono text-[11px] text-muted">
        {display}
      </span>
    </div>
  );
}

/**
 * Owner sales reports — read-only analytics for the owner's OWN venue (Square
 * parity, quick-win #2). Everything is derived from this venue's CONFIRMED
 * orders in the last 30 days: revenue KPIs (incl. GST collected), a daily
 * revenue trend, top items by revenue, and the dine-in/takeaway split. Pure
 * read — no money path, no writes. venue-scoped via requireVenue + scopedToVenue.
 */
export default async function ReportsPage() {
  await requireUser();
  const venue = await requireVenue();

  const now = new Date().getTime();
  const since = new Date(now - WINDOW_DAYS * 86_400_000);
  const dayMs = 86_400_000;

  const [orderRows, itemRows] = await Promise.all([
    db
      .select({
        totalCents: orders.totalCents,
        taxCents: orders.taxCents,
        orderType: orders.orderType,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(
        and(
          scopedToVenue(orders.venueId, venue.id),
          eq(orders.status, "confirmed"),
          gt(orders.createdAt, since),
        ),
      ),
    db
      .select({
        name: orderItems.itemNameSnapshot,
        lineTotalCents: orderItems.lineTotalCents,
        quantity: orderItems.quantity,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(
        and(
          scopedToVenue(orders.venueId, venue.id),
          eq(orders.status, "confirmed"),
          gt(orders.createdAt, since),
        ),
      ),
  ]);

  // KPIs.
  const revenue = orderRows.reduce((sum, o) => sum + o.totalCents, 0);
  const orderCount = orderRows.length;
  const avgOrder = orderCount > 0 ? Math.round(revenue / orderCount) : 0;
  const gstCollected = orderRows.reduce((sum, o) => sum + o.taxCents, 0);

  // Daily revenue trend (last TREND_DAYS).
  const trend: { label: string; cents: number }[] = [];
  for (let d = TREND_DAYS - 1; d >= 0; d -= 1) {
    const dayEnd = now - d * dayMs;
    const label = new Date(dayEnd).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
    });
    const cents = orderRows
      .filter(
        (o) =>
          o.createdAt.getTime() >= dayEnd - dayMs &&
          o.createdAt.getTime() < dayEnd,
      )
      .reduce((sum, o) => sum + o.totalCents, 0);
    trend.push({ label, cents });
  }
  const trendMax = Math.max(1, ...trend.map((t) => t.cents));

  // Top items by revenue.
  const byItem = new Map<string, { revenue: number; qty: number }>();
  for (const row of itemRows) {
    const cur = byItem.get(row.name) ?? { revenue: 0, qty: 0 };
    cur.revenue += row.lineTotalCents;
    cur.qty += row.quantity;
    byItem.set(row.name, cur);
  }
  const topItems = [...byItem.entries()]
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 8);
  const topItemMax = Math.max(1, ...topItems.map(([, v]) => v.revenue));

  // Order-type split.
  const dineIn = orderRows.filter((o) => o.orderType === "dine_in").length;
  const takeaway = orderCount - dineIn;
  const mixMax = Math.max(1, dineIn, takeaway);

  // Loyalty liability — points customers could still redeem × the point value.
  // Independent of the 30-day window (it's a running balance).
  const outstandingPoints = venue.loyaltyEnabled
    ? await getVenuePointsOutstanding(venue.id)
    : 0;
  const loyaltyLiabilityCents =
    outstandingPoints * venue.loyaltyRedeemValueCents;

  const empty = orderCount === 0;

  return (
    <main className="mx-auto w-full max-w-[1600px]">
      <PageHeader
        title="Reports"
        description={`Last ${WINDOW_DAYS} days · confirmed orders`}
      />

      <div className="space-y-6 px-5 py-8">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label="Revenue"
            value={`$${formatCents(revenue)}`}
            sub={`Last ${WINDOW_DAYS} days`}
          />
          <Kpi label="Orders" value={String(orderCount)} sub="Confirmed" />
          <Kpi label="Avg order" value={`$${formatCents(avgOrder)}`} sub="Per order" />
          <Kpi
            label="GST collected"
            value={`$${formatCents(gstCollected)}`}
            sub={venue.taxEnabled ? "Incl. in revenue" : "Tax off"}
          />
        </div>

        {venue.loyaltyEnabled ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] border border-line bg-surface-elevated p-4 shadow-card">
            <div>
              <p className={eyebrow}>Points liability</p>
              <p className="mt-1.5 font-display text-2xl font-extrabold text-ink">
                ${formatCents(loyaltyLiabilityCents)}
              </p>
            </div>
            <p className="text-xs text-muted">
              {outstandingPoints.toLocaleString("en-AU")} points outstanding ·
              customers could still redeem this much
            </p>
          </div>
        ) : null}

        {empty ? (
          <section className="rounded-card border border-line bg-surface-elevated p-8 text-center shadow-card">
            <p className="font-display text-lg font-semibold text-ink">
              No sales yet
            </p>
            <p className="mt-1 text-sm text-muted">
              Once orders come in, your revenue trend and best-selling items show
              up here.
            </p>
          </section>
        ) : (
          <>
            {/* Daily revenue trend */}
            <section className="rounded-card border border-line bg-surface-elevated p-5 shadow-card">
              <p className={eyebrow}>Revenue · last {TREND_DAYS} days</p>
              <div className="mt-4 flex h-40 items-end gap-1.5">
                {trend.map((t, i) => (
                  <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                    <div
                      className="w-full rounded-t-[3px] bg-[var(--color-accent)] transition-all"
                      style={{ height: `${Math.max(3, (t.cents / trendMax) * 100)}%` }}
                      title={`${t.label}: $${formatCents(t.cents)}`}
                    />
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
                <p className={eyebrow}>Top items · by revenue</p>
                <div className="mt-3">
                  {topItems.map(([name, agg]) => (
                    <BarRow
                      key={name}
                      label={name}
                      value={agg.revenue}
                      max={topItemMax}
                      display={`$${formatCents(agg.revenue)}`}
                    />
                  ))}
                </div>
              </section>

              <section className="rounded-card border border-line bg-surface-elevated p-5 shadow-card">
                <p className={eyebrow}>Order type</p>
                <div className="mt-3">
                  <BarRow
                    label="Dine-in"
                    value={dineIn}
                    max={mixMax}
                    display={String(dineIn)}
                  />
                  <BarRow
                    label="Takeaway"
                    value={takeaway}
                    max={mixMax}
                    display={String(takeaway)}
                  />
                </div>
                <p className="mt-3 text-xs text-muted">
                  Best seller:{" "}
                  <span className="font-semibold text-ink">
                    {topItems[0]?.[0] ?? "—"}
                  </span>{" "}
                  ({topItems[0] ? `${topItems[0][1].qty} sold` : "—"})
                </p>
              </section>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
