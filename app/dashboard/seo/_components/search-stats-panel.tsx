import { cardStyles } from "@/app/_components/card";

import type { SearchStats } from "../queries";

/**
 * "How you're doing on Google" — real Search Console numbers for the venue's
 * storefront path, ingested daily by /api/jobs/seo-stats from the PLATFORM'S
 * property credential (owners never connect Google). Three states: platform
 * credential not configured, configured-but-no-data-yet, and live stats.
 */

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-line bg-surface-elevated p-4 shadow-card">
      <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-label">
        {label}
      </p>
      <p className="mt-1.5 font-display text-2xl font-extrabold text-ink">
        {value}
      </p>
    </div>
  );
}

/** Daily clicks as a CSS bar strip (no chart lib, house style). */
function ClicksTrend({ days }: { days: SearchStats["days"] }) {
  const max = Math.max(1, ...days.map((day) => day.clicks));
  return (
    <div>
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
        Clicks by day
      </p>
      <div
        className="mt-2 flex h-16 items-end gap-[3px]"
        role="img"
        aria-label={`Daily clicks over the last ${days.length} recorded days`}
      >
        {days.map((day) => (
          <span
            key={day.day}
            title={`${day.day}: ${day.clicks} clicks, ${day.impressions} impressions`}
            style={{ height: `${Math.max(4, (100 * day.clicks) / max)}%` }}
            className="min-w-1 flex-1 rounded-t-sm bg-accent"
          />
        ))}
      </div>
    </div>
  );
}

const formatCount = (value: number): string =>
  new Intl.NumberFormat("en-AU").format(value);

export function SearchStatsPanel({
  configured,
  stats,
}: {
  configured: boolean;
  stats: SearchStats;
}) {
  const hasData = stats.days.length > 0;

  return (
    <section>
      <h2 className="font-display text-base font-semibold text-ink">
        Google search performance
      </h2>
      {!configured && !hasData ? (
        <div className={cardStyles({ className: "mt-3" })}>
          <p className="text-sm font-medium text-ink">
            Search stats aren&apos;t connected yet.
          </p>
          <p className="mt-1 text-sm text-muted">
            Once Prompt2Eat&apos;s Google Search Console connection is switched
            on, real clicks and impressions for your storefront appear here
            automatically — nothing for you to set up.
          </p>
        </div>
      ) : !hasData ? (
        <div className={cardStyles({ className: "mt-3" })}>
          <p className="text-sm font-medium text-ink">Collecting data…</p>
          <p className="mt-1 text-sm text-muted">
            Google is gathering search data for your storefront. New pages can
            take a few days to start reporting; stats update daily.
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Clicks · 28 days" value={formatCount(stats.totals.clicks)} />
            <Kpi
              label="Impressions · 28 days"
              value={formatCount(stats.totals.impressions)}
            />
            <Kpi
              label="Click-through rate"
              value={`${(stats.totals.ctr * 100).toFixed(1)}%`}
            />
            <Kpi
              label="Avg position"
              value={
                stats.totals.position > 0
                  ? stats.totals.position.toFixed(1)
                  : "—"
              }
            />
          </div>

          <div className={cardStyles({ className: "p-4" })}>
            <ClicksTrend days={stats.days} />
          </div>

          {stats.topQueries.length > 0 ? (
            <div className={cardStyles({ className: "p-4" })}>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
                What people searched to find you
              </p>
              <ul className="mt-2 divide-y divide-line/60">
                {stats.topQueries.map((query) => (
                  <li
                    key={query.query}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <span className="min-w-0 truncate text-sm text-ink">
                      {query.query}
                    </span>
                    <span className="flex shrink-0 items-center gap-4 font-mono text-[11px] font-bold text-muted">
                      <span>{formatCount(query.clicks)} clicks</span>
                      <span>{formatCount(query.impressions)} views</span>
                      <span>#{Math.round(query.position)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
