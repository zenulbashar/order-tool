import Link from "next/link";
import { and, eq, gte, inArray, sql } from "drizzle-orm";

import { cx } from "@/app/_components/cx";
import { PageHeader } from "@/app/_components/page-header";
import { NewBookingAlert } from "./bookings/new-booking-alert";
import { getUpcomingBookingCount } from "./bookings/queries";
import { db } from "@/lib/db";
import { PAID_ORDER_STATUSES } from "@/lib/db/order-status";
import { orders, refunds } from "@/lib/db/schema";
import { computeMenuHealth } from "@/lib/menu-health";
import { netOrderMoney } from "@/lib/orders/net-money";
import { buildSuggestions } from "@/lib/nudges";
import {
  hasVenuePermission,
  isOnboardingComplete,
  requireUser,
  requireVenue,
  scopedToVenue,
} from "@/lib/tenant";
import { formatCents, orderReference } from "@/lib/validation";

import { getCategoriesForVenue, getItemsForVenue } from "./menu/queries";
import { getVenueOrders } from "./orders/queries";

export const dynamic = "force-dynamic";

/* -------------------------------------------------------------------------- */
/*  Owner Overview — the "Today" landing (design_handoff: owner-overview).      */
/*                                                                            */
/*  A live operating dashboard built entirely from the venue's OWN, venue-      */
/*  scoped data: today's orders / revenue / average vs the recent daily         */
/*  average, this week's revenue, dine-in vs takeaway mix, the live kitchen     */
/*  queue, and the top real Concierge suggestion. Server-rendered; charts are   */
/*  dependency-free SVG/CSS (same idiom as menu-health, studio, admin stats).   */
/*  Read-only — no writes, no money-path involvement.                          */
/* -------------------------------------------------------------------------- */

const eyebrow =
  "font-mono text-2xs font-bold uppercase tracking-wider text-label";
const cardBox =
  "rounded-card border border-line bg-surface-elevated p-4 shadow-card";

/** venue-local hour (00–23); UTC fallback on a malformed zone. */
function venueHour(now: Date, timeZone: string): number {
  const read = (tz: string) =>
    Number(
      new Intl.DateTimeFormat("en-US", {
        hour: "2-digit",
        hourCycle: "h23",
        timeZone: tz,
      }).format(now),
    );
  try {
    return read(timeZone);
  } catch {
    return read("UTC");
  }
}

/** "Saturday, 28 June" in the venue's timezone (UTC fallback). */
function venueDate(now: Date, timeZone: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    weekday: "long",
    day: "numeric",
    month: "long",
  };
  try {
    return new Intl.DateTimeFormat("en-AU", { ...opts, timeZone }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-AU", { ...opts, timeZone: "UTC" }).format(now);
  }
}

function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** A reusable en-CA (ISO-ordered) day-key formatter in the venue's timezone. */
function dayKeyFormatter(timeZone: string): Intl.DateTimeFormat {
  const opts: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  };
  try {
    return new Intl.DateTimeFormat("en-CA", { ...opts, timeZone });
  } catch {
    return new Intl.DateTimeFormat("en-CA", { ...opts, timeZone: "UTC" });
  }
}

/** Whole-dollar money, no cents (e.g. "$3,480"). */
function dollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-AU")}`;
}

/** Compact money for a chart badge ("$3.4k" / "$820"). */
function compactDollars(cents: number): string {
  const d = cents / 100;
  return d >= 1000 ? `$${(d / 1000).toFixed(1)}k` : `$${Math.round(d)}`;
}

const mean = (xs: number[]): number =>
  xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;

/** Percent change vs a baseline, or null when the baseline is ~0 (no delta). */
function pctDelta(current: number, base: number): number | null {
  if (base <= 0) return null;
  return Math.round(((current - base) / base) * 100);
}

function relativeAge(date: Date, nowMs: number): string {
  const mins = Math.floor((nowMs - date.getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h`;
}

/* --------------------------------- viz ------------------------------------ */

function Sparkline({ values, stroke }: { values: number[]; stroke: string }) {
  const w = 58;
  const h = 20;
  const pad = 2;
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = pad + (1 - (v - min) / span) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" stroke={stroke} strokeWidth={2}>
      <polyline points={points} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Ring({ pct, stroke }: { pct: number; stroke: string }) {
  const r = 20;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.max(0, Math.min(100, pct)) / 100);
  return (
    <svg width={56} height={56} viewBox="0 0 52 52" aria-hidden="true">
      <circle cx={26} cy={26} r={r} stroke="var(--color-line)" strokeWidth={5} fill="none" />
      <circle
        cx={26}
        cy={26}
        r={r}
        stroke={stroke}
        strokeWidth={5}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 26 26)"
      />
    </svg>
  );
}

function Delta({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="text-eyebrow font-semibold text-muted">new</span>;
  }
  const up = value >= 0;
  return (
    <span
      className={cx(
        "text-eyebrow font-bold",
        up ? "text-success-deep" : "text-warm-deep",
      )}
    >
      {up ? "▲" : "▼"} {Math.abs(value)}%
    </span>
  );
}

/* --------------------------------- page ----------------------------------- */

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireUser();
  const venue = await requireVenue();

  /**
   * The venue's TRADING POSITION — revenue, average order value, the 7-day
   * chart, the 30-day order mix, and the Concierge insight (which names a
   * dish's gross margin). /dashboard/reports gates the same figures on
   * `reports:view` with the comment "a kitchen login has no business reading
   * it"; this page rendered them on bare membership, so the gate could be
   * walked around by clicking Home. Worse, `requireVenuePermission` denies by
   * redirecting HERE — a staff member who opened Sales reports was bounced
   * onto the page showing the very numbers they had just been denied.
   *
   * Gated by NOT FETCHING rather than by hiding: the 30-day query below is
   * skipped outright when the permission is absent, so the figures never reach
   * the render at all and cannot be recovered from the RSC payload.
   */
  const canViewReports = await hasVenuePermission(venue.id, "reports:view");
  const denied = (await searchParams).denied !== undefined;

  // Drives the live "a table was just booked" popup below. Cheap venue-scoped
  // count(); the owner home is already dynamic.
  const upcomingBookingCount = await getUpcomingBookingCount(
    venue.id,
    new Date(),
  );
  const needsOnboarding = !isOnboardingComplete(venue);

  const now = new Date();
  const nowMs = now.getTime();
  const greeting = greetingFor(venueHour(now, venue.timezone));
  const firstName = user.name?.trim().split(/\s+/)[0] ?? "";
  const title = firstName ? `${greeting}, ${firstName}` : greeting;

  const since30 = new Date(nowMs - 30 * 86_400_000);

  const [recentOrders, items, categories, active, suggestions, refundRows] =
    await Promise.all([
    // Confirmed orders over 30 days — powers today's KPIs, the 7-day trend, and
    // the order mix. Bucketed by venue-local day in JS (tz-correct via Intl).
    // Not run at all without reports:view; the tiles it feeds are not rendered.
    canViewReports
      ? db
          .select({
            id: orders.id,
            createdAt: orders.createdAt,
            totalCents: orders.totalCents,
            orderType: orders.orderType,
          })
          .from(orders)
          .where(
            and(
              scopedToVenue(orders.venueId, venue.id),
              // PAID, not 'confirmed' — same reason as /dashboard/reports. A
              // refunded cent rewrites the status, and dropping the order made
              // this page disagree with both Reports and the Payments card.
              inArray(orders.status, PAID_ORDER_STATUSES),
              gte(orders.createdAt, since30),
            ),
          )
      : [],
    getItemsForVenue(venue.id),
    getCategoriesForVenue(venue.id),
    getVenueOrders(venue.id),
    // Concierge suggestions quote per-dish gross margin ("X margin is 42%") and
    // ingredient costs — commercial data, same class as the revenue tiles.
    canViewReports ? buildSuggestions(venue.id) : [],
    // Succeeded refunds keyed on the ORDER, so one lands in its order's day
    // rather than its own — the convention the Payments card already uses.
    canViewReports
      ? db
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
              gte(orders.createdAt, since30),
            ),
          )
          .groupBy(refunds.orderId)
      : [],
  ]);

  // Bucket paid orders by venue-local day, each netted by what has gone back on
  // it first. taxCents is not selected here (this page shows no GST figure), so
  // the tax half of netOrderMoney is passed 0 and left unused.
  const refundedByOrder = new Map(
    refundRows.map((r) => [r.orderId, Number(r.total)]),
  );
  const keyOf = dayKeyFormatter(venue.timezone);
  const byDay = new Map<string, { orders: number; revenue: number }>();
  let dineIn = 0;
  let takeaway = 0;
  for (const row of recentOrders) {
    const key = keyOf.format(row.createdAt);
    const bucket = byDay.get(key) ?? { orders: 0, revenue: 0 };
    bucket.orders += 1;
    bucket.revenue += netOrderMoney(
      row.totalCents,
      0,
      refundedByOrder.get(row.id) ?? 0,
    ).netTotalCents;
    byDay.set(key, bucket);
    if (row.orderType === "dine_in") dineIn += 1;
    else takeaway += 1;
  }

  // Calendar-day series (pure date arithmetic on the venue-local "today").
  const todayKey = keyOf.format(now);
  const [ty, tm, td] = todayKey.split("-").map(Number);
  const dayFor = (offset: number) => {
    const d = new Date(Date.UTC(ty, tm - 1, td - offset));
    return {
      key: d.toISOString().slice(0, 10),
      label: new Intl.DateTimeFormat("en-AU", {
        weekday: "narrow",
        timeZone: "UTC",
      }).format(d),
    };
  };
  const week = Array.from({ length: 7 }, (_, i) => dayFor(6 - i)); // oldest → today
  const prior = Array.from({ length: 7 }, (_, i) => dayFor(i + 1)); // yesterday → 7d ago

  const val = (key: string) => byDay.get(key) ?? { orders: 0, revenue: 0 };
  const today = val(todayKey);
  const avgOrderCents = today.orders > 0 ? Math.round(today.revenue / today.orders) : 0;

  const priorOrders = prior.map((d) => val(d.key).orders);
  const priorRevenue = prior.map((d) => val(d.key).revenue);
  const priorAvg = prior
    .map((d) => {
      const b = val(d.key);
      return b.orders > 0 ? b.revenue / b.orders : null;
    })
    .filter((x): x is number => x !== null);

  const ordersDelta = pctDelta(today.orders, mean(priorOrders));
  const revenueDelta = pctDelta(today.revenue, mean(priorRevenue));
  const avgDelta = pctDelta(avgOrderCents, mean(priorAvg));

  const weekRevenue = week.map((d) => val(d.key).revenue);
  const weekOrders = week.map((d) => val(d.key).orders);
  const weekTotal = weekRevenue.reduce((s, x) => s + x, 0);
  const maxBar = Math.max(...weekRevenue, 1);

  // Menu health + low-stock advisory count for the fourth KPI.
  const health = computeMenuHealth(items, categories);
  const healthStroke =
    health.band === "good"
      ? "var(--color-success-deep)"
      : health.band === "ok"
        ? "var(--color-accent)"
        : "var(--color-warm-deep)";
  const healthIssues = health.criticalIssues.length;

  // Order mix over the window.
  const mixTotal = dineIn + takeaway;
  const dineInPct = mixTotal > 0 ? Math.round((dineIn / mixTotal) * 100) : 0;
  const takeawayPct = mixTotal > 0 ? 100 - dineInPct : 0;

  // Live kitchen queue — newest first for the glance, capped.
  const live = [...active].reverse().slice(0, 5);
  const liveBadge: Record<string, string> = {
    new: "bg-[var(--color-accent)] text-forest",
    preparing: "bg-[var(--color-accent)]/15 text-accent-deep",
    ready: "bg-[var(--color-success-deep)]/12 text-success-deep",
  };
  const liveLabel: Record<string, string> = {
    new: "New",
    preparing: "Preparing",
    ready: "Ready",
  };

  const topSuggestion = suggestions[0] ?? null;

  // The operational row a kitchen login sees in place of the trading tiles.
  // Built entirely from `active` (the live queue they already have orders:view
  // on) and the booking count — no extra query, and no money.
  const preparingCount = active.filter(
    (o) => o.fulfillmentStatus === "preparing",
  ).length;
  const readyCount = active.filter(
    (o) => o.fulfillmentStatus === "ready",
  ).length;

  return (
    <main className="mx-auto w-full max-w-[1600px]">
      <PageHeader
        title={title}
        description={`${venue.name} · ${venueDate(now, venue.timezone)} · here's how today's shaping up.`}
        action={
          <Link
            href={`/${venue.slug}`}
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-control bg-forest px-3.5 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          >
            View storefront{" "}
            <span aria-hidden="true" className="text-[var(--color-accent)]">
              ↗
            </span>
          </Link>
        }
      />

      <section className="space-y-4 px-5 py-8">
        {denied ? (
          /* requireVenuePermission redirects here on denial. Nothing used to
             read the flag, so a staff member who opened Sales reports simply
             found themselves on Home with no explanation. */
          <p
            role="status"
            className="rounded-card border border-[var(--color-warm-deep)]/30 bg-[var(--color-warm-deep)]/10 px-4 py-3 text-sm text-ink"
          >
            You don&apos;t have access to that page. Ask an owner or manager if
            you need it.
          </p>
        ) : null}

        {needsOnboarding ? (
          <Link
            href="/onboarding"
            className="group flex items-center justify-between gap-3 rounded-card border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 px-4 py-3 transition hover:border-[var(--color-accent)]/50"
          >
            <span className="text-sm text-ink">
              Finish setting up your venue to go live and take orders.
            </span>
            <span className="shrink-0 text-sm font-medium text-[var(--action)]">
              Finish setup{" "}
              <span
                aria-hidden="true"
                className="inline-block transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
              >
                →
              </span>
            </span>
          </Link>
        ) : null}

        {/* KPI row */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className={cardBox}>
            <p className={eyebrow}>
              {canViewReports ? "Today's orders" : "Open orders"}
            </p>
            <p className="mt-1.5 font-display text-3xl font-extrabold text-ink">
              {canViewReports ? today.orders : active.length}
            </p>
            {canViewReports ? (
              <div className="mt-2 flex items-center justify-between">
                <Delta value={ordersDelta} />
                <Sparkline values={weekOrders} stroke="var(--color-success-deep)" />
              </div>
            ) : (
              /* today.orders is derived from the 30-day query, which is skipped
                 without reports:view — rendering it here would report a
                 confident, wrong 0 rather than nothing. */
              <p className="mt-2 text-micro font-semibold text-muted">
                in the kitchen right now
              </p>
            )}
          </div>

          {canViewReports ? (
            <>
              <div className={cardBox}>
                <p className={eyebrow}>Revenue</p>
                <p className="mt-1.5 font-display text-3xl font-extrabold text-ink">
                  {dollars(today.revenue)}
                </p>
                <div className="mt-2 flex items-center justify-between">
                  <Delta value={revenueDelta} />
                  <Sparkline values={weekRevenue} stroke="var(--color-success-deep)" />
                </div>
              </div>

              <div className={cardBox}>
                <p className={eyebrow}>Avg order</p>
                <p className="mt-1.5 font-display text-3xl font-extrabold text-ink">
                  ${formatCents(avgOrderCents)}
                </p>
                <div className="mt-2 flex items-center justify-between">
                  <Delta value={avgDelta} />
                  <Sparkline
                    values={week.map((d) => {
                      const b = val(d.key);
                      return b.orders > 0 ? b.revenue / b.orders : 0;
                    })}
                    stroke="var(--color-accent)"
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Same two slots, filled with what someone running the pass
                  actually needs. No query of their own — both counts come from
                  the live queue already fetched for the tile below. */}
              <div className={cardBox}>
                <p className={eyebrow}>Preparing</p>
                <p className="mt-1.5 font-display text-3xl font-extrabold text-ink">
                  {preparingCount}
                </p>
                <p className="mt-2 text-micro font-semibold text-muted">
                  {preparingCount === 1 ? "order" : "orders"} on the pass
                </p>
              </div>

              <div className={cardBox}>
                <p className={eyebrow}>Ready</p>
                <p className="mt-1.5 font-display text-3xl font-extrabold text-ink">
                  {readyCount}
                </p>
                <p className="mt-2 text-micro font-semibold text-muted">
                  waiting to be handed over
                </p>
              </div>
            </>
          )}

          <div className={cx(cardBox, "flex items-center gap-4")}>
            <div className="flex-1">
              <p className={eyebrow}>Menu health</p>
              <p className="mt-1.5 font-display text-3xl font-extrabold text-ink">
                {health.hasItems ? `${health.score}%` : "—"}
              </p>
              <p
                className={cx(
                  "mt-1.5 text-micro font-semibold",
                  healthIssues > 0 ? "text-accent-deep" : "text-muted",
                )}
              >
                {!health.hasItems
                  ? "Add menu items"
                  : healthIssues > 0
                    ? `${healthIssues} item${healthIssues === 1 ? "" : "s"} need attention`
                    : "Looks great"}
              </p>
            </div>
            <Ring pct={health.hasItems ? health.score : 0} stroke={healthStroke} />
          </div>
        </div>

        {/* Revenue this week + Order mix — both derived from the 30-day
            confirmed-orders query, which reports:view gates. */}
        {canViewReports ? (
          <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
            <div className={cardBox}>
              <div className="flex items-center justify-between">
                <p className="font-display text-sm font-bold text-ink">
                  Revenue · this week
                </p>
                <span className={eyebrow}>{dollars(weekTotal)} total</span>
              </div>
              {weekTotal === 0 ? (
                <p className="py-10 text-center text-sm text-muted">
                  No sales yet this week — orders will chart here as they come in.
                </p>
              ) : (
                <div className="mt-5 flex h-32 items-end gap-2 sm:gap-3">
                  {week.map((d, i) => {
                    const isToday = i === week.length - 1;
                    const heightPct = Math.max(4, (weekRevenue[i] / maxBar) * 100);
                    return (
                      <div key={d.key} className="flex flex-1 flex-col items-center gap-1.5">
                        <div className="flex h-28 w-full items-end justify-center">
                          <div
                            className={cx(
                              "relative w-2/3 rounded-t-[6px]",
                              isToday ? "bg-forest-deep" : "bg-[var(--color-accent)]",
                            )}
                            style={{ height: `${heightPct}%` }}
                          >
                            {isToday && weekRevenue[i] > 0 ? (
                              <span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-[5px] bg-[var(--color-accent)] px-1.5 py-0.5 font-mono text-2xs font-bold text-forest">
                                {compactDollars(weekRevenue[i])}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <span
                          className={cx(
                            "font-mono text-micro",
                            isToday ? "font-bold text-ink" : "text-muted",
                          )}
                        >
                          {d.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className={cardBox}>
              <p className="font-display text-sm font-bold text-ink">Order mix</p>
              {mixTotal === 0 ? (
                <p className="py-10 text-center text-sm text-muted">
                  No orders in the last 30 days yet.
                </p>
              ) : (
                <div className="mt-3.5 flex items-center gap-5">
                  <div
                    className="relative h-24 w-24 shrink-0 rounded-full"
                    style={{
                      background: `conic-gradient(var(--color-forest-deep) 0 ${dineInPct}%, var(--color-accent) 0 100%)`,
                    }}
                  >
                    <div className="absolute inset-[13px] flex flex-col items-center justify-center rounded-full bg-surface-elevated">
                      <span className="font-display text-lg font-extrabold text-ink">
                        {mixTotal}
                      </span>
                      <span className="font-mono text-[8px] uppercase tracking-wider text-label">
                        orders
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-[3px] bg-forest-deep" />
                        <span className="text-xs font-bold text-ink">Dine-in</span>
                      </div>
                      <p className="ml-[18px] font-display text-base font-extrabold text-ink">
                        {dineInPct}%
                      </p>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-[3px] bg-[var(--color-accent)]" />
                        <span className="text-xs font-bold text-ink">Takeaway</span>
                      </div>
                      <p className="ml-[18px] font-display text-base font-extrabold text-ink">
                        {takeawayPct}%
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* Live orders + Concierge insight */}
        <div
          className={cx(
            "grid gap-4",
            // Without the Concierge tile the 1fr column would sit empty.
            canViewReports ? "lg:grid-cols-[1.55fr_1fr]" : "lg:grid-cols-1",
          )}
        >
          <div className={cardBox}>
            <div className="mb-1 flex items-center justify-between">
              <p className="font-display text-sm font-bold text-ink">Live orders</p>
              <Link
                href="/dashboard/orders"
                className="text-eyebrow font-bold text-success-deep hover:opacity-80"
              >
                ● {active.length} active
              </Link>
            </div>
            {live.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">
                No live orders right now. New paid orders appear here in real time.
              </p>
            ) : (
              <ul>
                {live.map((order) => {
                  const qty = order.items.reduce((s, it) => s + it.quantity, 0);
                  const where =
                    order.orderType === "dine_in"
                      ? `Table ${order.tableLabel ?? "—"}`
                      : "Pickup";
                  return (
                    <li
                      key={order.id}
                      className="flex items-center gap-3 border-b border-line/60 py-2.5 last:border-0"
                    >
                      <span className="font-mono text-[12px] font-bold text-ink">
                        {orderReference(order.publicToken)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-muted">
                        {where} · {qty} item{qty === 1 ? "" : "s"}
                      </span>
                      <span
                        className={cx(
                          "shrink-0 rounded-sm px-2 py-0.5 text-micro font-bold",
                          liveBadge[order.fulfillmentStatus] ?? "bg-sand text-muted",
                        )}
                      >
                        {liveLabel[order.fulfillmentStatus] ?? order.fulfillmentStatus}
                      </span>
                      <span className="w-10 shrink-0 text-right font-mono text-eyebrow text-muted">
                        {relativeAge(order.scheduledFor ?? order.createdAt, nowMs)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Concierge insight. Gated with the revenue tiles, not separately:
              its suggestions name a dish's gross margin ("Pad Thai margin is
              38%") and ingredient costs, which is the same commercial data
              reports:view exists to protect. */}
          {canViewReports ? (
            <div
              className="relative overflow-hidden rounded-card p-5 shadow-card"
              style={{
                background:
                  "linear-gradient(135deg, var(--color-forest-deep), var(--color-concierge-glow))",
              }}
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full"
                style={{
                  background:
                    "radial-gradient(circle, color-mix(in srgb, var(--color-accent) 30%, transparent), transparent 65%)",
                }}
              />
              <div className="relative flex items-center gap-2">
                <span className="text-base text-[var(--color-accent)]" aria-hidden="true">
                  ✦
                </span>
                <span className="font-mono text-eyebrow font-bold uppercase tracking-wider text-[var(--color-accent)]">
                  Concierge insight
                </span>
              </div>
              {topSuggestion ? (
                <>
                  <p className="relative mt-3 text-[15px] font-semibold leading-snug text-white">
                    {topSuggestion.title}
                  </p>
                  <p className="relative mt-1.5 text-xs text-white/75">
                    {topSuggestion.detail}
                  </p>
                  <Link
                    href={topSuggestion.href}
                    className="relative mt-3.5 inline-flex rounded-control bg-[var(--color-accent)] px-3.5 py-2 text-xs font-bold text-forest transition hover:opacity-90"
                  >
                    {topSuggestion.actionLabel} →
                  </Link>
                </>
              ) : (
                <>
                  <p className="relative mt-3 text-[15px] font-semibold leading-snug text-white">
                    You&apos;re all caught up.
                  </p>
                  <p className="relative mt-1.5 text-xs text-white/75">
                    Nothing needs your attention right now. New suggestions appear
                    here as your menu and stock data grows.
                  </p>
                  <Link
                    href="/dashboard/stock/suggestions"
                    className="relative mt-3.5 inline-flex rounded-control bg-white/10 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-white/15"
                  >
                    Open suggestions →
                  </Link>
                </>
              )}
            </div>
          ) : null}
        </div>
      </section>

      {/* Live booking popup. Mounted on the owner home as well as the bookings
          page, because "I was looking at the dashboard" is the common case. */}
      <NewBookingAlert count={upcomingBookingCount} />
    </main>
  );
}
