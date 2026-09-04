import type { Metadata } from "next";
import { and, eq, gt, inArray, sql } from "drizzle-orm";

import { PageHeader } from "@/app/_components/page-header";
import { FEATURES, hasFeature } from "@/lib/billing/plans";
import { getVenuePlan } from "@/lib/billing/queries";
import { db } from "@/lib/db";
import { PAID_ORDER_STATUSES } from "@/lib/db/order-status";
import { orderItems, orders, refunds } from "@/lib/db/schema";
import { isInsightsConfigured } from "@/lib/insights";
import { getVenuePointsOutstanding } from "@/lib/loyalty/balance";
import { netOrderMoney } from "@/lib/orders/net-money";
import {
  venueCalendarDays,
  venueDayFormatter,
} from "@/lib/orders/service-date";
import { requireVenuePermission, scopedToVenue } from "@/lib/tenant";
import { formatCents } from "@/lib/validation";

import { AskPanel, type AskPanelState } from "./ask-panel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reports" };

const WINDOW_DAYS = 30;
const TREND_DAYS = 14;

const eyebrow =
  "font-mono text-2xs font-bold uppercase tracking-wider text-label";

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-[14px] border border-line bg-surface-elevated p-4 shadow-card">
      <p className={eyebrow}>{label}</p>
      <p className="mt-1.5 font-display text-2xl font-extrabold text-ink">{value}</p>
      {sub ? <p className="mt-1 text-micro font-semibold text-muted">{sub}</p> : null}
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
      <span className="w-16 shrink-0 text-right font-mono text-eyebrow text-muted">
        {display}
      </span>
    </div>
  );
}

/**
 * Owner sales reports — read-only analytics for the owner's OWN venue (Square
 * parity, quick-win #2). Everything is derived from this venue's PAID orders in
 * the last 30 days — every status that took money, not just `confirmed` — with
 * succeeded refunds netted off per order: revenue KPIs (incl. GST collected), a
 * daily revenue trend, top items by revenue, and the dine-in/takeaway split.
 *
 * The status set and the refund subtraction both match
 * `getConfirmedSalesSummary`, which drives the Payments card. They used to
 * disagree, and the disagreement was not subtle: one $10 goodwill refund on a
 * $55 order left Payments reading "$45.00" and this page reading "No sales yet".
 *
 * Pure read — no money path, no writes. venue-scoped via
 * requireVenuePermission + scopedToVenue.
 */
export default async function ReportsPage() {
  // Gated on reports:view, not bare membership. Thirty-day revenue, GST collected and top items — the venue's trading position. reports:view is owner+manager; a kitchen login has no business reading it.
  // The matching sidebar entry is hidden for viewers without it, but this
  // gate is the control — the URL is typeable.
  const venue = await requireVenuePermission("reports:view");

  const now = new Date();
  const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000);

  const [orderRows, itemRows, refundRows] = await Promise.all([
    db
      .select({
        id: orders.id,
        totalCents: orders.totalCents,
        taxCents: orders.taxCents,
        orderType: orders.orderType,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(
        and(
          scopedToVenue(orders.venueId, venue.id),
          // PAID, not 'confirmed'. syncOrderRefundStatus rewrites the status
          // the moment any money goes back, so filtering on 'confirmed' alone
          // removed a $55 order from this page entirely over a $10 goodwill
          // refund — Revenue $0.00, GST $0.00, "No sales yet" — while the
          // Payments card read $45.00 for the same window and the docket for
          // that order still printed $55.00. Refunds are netted below rather
          // than the order being dropped.
          inArray(orders.status, PAID_ORDER_STATUSES),
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
          // Same widening, so a partly refunded order stops vanishing from Top
          // Items. Its lines are counted at full value: a refund is recorded
          // against the ORDER and carries no line attribution, so there is
          // nothing to net an individual item by. Dropping the order outright
          // was the larger distortion.
          inArray(orders.status, PAID_ORDER_STATUSES),
          gt(orders.createdAt, since),
        ),
      ),
    // Succeeded refunds against orders in the SAME window, keyed on the order
    // so a refund always lands in its order's 30 days rather than its own —
    // the convention getConfirmedSalesSummary already uses on the Payments card.
    db
      .select({
        orderId: refunds.orderId,
        total: sql<number>`coalesce(sum(${refunds.amountCents}), 0)`,
      })
      .from(refunds)
      .innerJoin(orders, eq(orders.id, refunds.orderId))
      .where(
        and(
          scopedToVenue(orders.venueId, venue.id),
          eq(refunds.status, "succeeded"),
          gt(orders.createdAt, since),
        ),
      )
      .groupBy(refunds.orderId),
  ]);

  // Net each order by what has actually gone back on it, BEFORE any aggregate
  // is taken. Per order rather than one subtraction off the totals, because the
  // GST apportionment needs each order's own tax ratio — a venue that turned
  // GST off mid-window leaves taxCents = 0 on everything after it.
  const refundedByOrder = new Map(
    refundRows.map((r) => [r.orderId, Number(r.total)]),
  );
  const netRows = orderRows.map((o) => ({
    ...o,
    ...netOrderMoney(o.totalCents, o.taxCents, refundedByOrder.get(o.id) ?? 0),
  }));

  // KPIs — net of refunds, matching the Payments card.
  const revenue = netRows.reduce((sum, o) => sum + o.netTotalCents, 0);
  // The order COUNT stays gross: a partly refunded order is still an order the
  // venue served, and Payments counts it the same way.
  const orderCount = netRows.length;
  const avgOrder = orderCount > 0 ? Math.round(revenue / orderCount) : 0;
  const gstCollected = netRows.reduce((sum, o) => sum + o.netTaxCents, 0);
  const refundedCents = netRows.reduce((sum, o) => sum + o.refundedCents, 0);

  // Daily revenue trend — venue-local CALENDAR days, the same way the owner
  // Overview buckets the identical rows. This used to slice rolling 24h windows
  // anchored to the request instant and label them with no timeZone, so on
  // Vercel (process runs UTC) a Sydney venue opening Reports at 09:00 Wednesday
  // saw Wednesday's takings filed under Tuesday — while the Overview on the same
  // dashboard reported them under "Today". The bar heights were wrong too, not
  // only the labels.
  const dayKeyOf = venueDayFormatter(venue.timezone);
  const revenueByDay = new Map<string, number>();
  for (const row of netRows) {
    const key = dayKeyOf.format(row.createdAt);
    revenueByDay.set(key, (revenueByDay.get(key) ?? 0) + row.netTotalCents);
  }
  // timeZone: "UTC" is load-bearing — `date` is a calendar date built in UTC,
  // not an instant, so formatting it in the process zone would name a different
  // day than the key it was derived from.
  const trendLabel = new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const trend = venueCalendarDays(venue.timezone, now, TREND_DAYS).map(
    (d) => ({
      label: trendLabel.format(d.date),
      cents: revenueByDay.get(d.key) ?? 0,
    }),
  );
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
  const dineIn = netRows.filter((o) => o.orderType === "dine_in").length;
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

  // "Ask your data": plan-gated like the other owner AI tools, off when the
  // deployment has no model key, and pointless with no sales to ask about.
  // The server action re-checks all of this; these only pick the panel copy.
  const plan = await getVenuePlan(venue.id);
  const askState: AskPanelState =
    plan === null || !hasFeature({ plan }, FEATURES.AI_INSIGHTS)
      ? "no-plan"
      : !isInsightsConfigured()
        ? "unconfigured"
        : empty
          ? "no-sales"
          : "ready";

  return (
    <main className="mx-auto w-full max-w-[1600px]">
      <PageHeader
        title="Reports"
        description={`Last ${WINDOW_DAYS} days · paid orders, net of refunds`}
      />

      <div className="space-y-6 px-5 py-8">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label="Revenue"
            value={`$${formatCents(revenue)}`}
            sub={
              refundedCents > 0
                ? `Last ${WINDOW_DAYS} days · net of $${formatCents(refundedCents)} refunded`
                : `Last ${WINDOW_DAYS} days`
            }
          />
          <Kpi label="Orders" value={String(orderCount)} sub="Paid" />
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

        <AskPanel state={askState} />

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
