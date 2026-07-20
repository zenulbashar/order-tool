import type { Metadata } from "next";

import { PageHeader } from "@/app/_components/page-header";
import { requireUser, requireVenue } from "@/lib/tenant";
import { formatCents } from "@/lib/validation";

import { CUSTOMER_TABLE_CAP, getVenueCustomers } from "./queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Customers" };

const eyebrow =
  "font-mono text-[9px] font-bold uppercase tracking-wider text-label";
const th = "px-4 py-2.5 text-left font-mono text-[9px] font-bold uppercase tracking-wider text-label";
const thRight = `${th} text-right`;

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-[14px] border border-line bg-surface-elevated p-4 shadow-card">
      <p className={eyebrow}>{label}</p>
      <p className="mt-1.5 font-display text-2xl font-extrabold text-ink">{value}</p>
      {sub ? <p className="mt-1 text-[10px] font-semibold text-muted">{sub}</p> : null}
    </div>
  );
}

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
      <span className="w-32 shrink-0 truncate text-xs font-medium text-ink">{label}</span>
      <span className="h-3 flex-1 overflow-hidden rounded-pill bg-line">
        <span
          className="block h-full rounded-pill bg-[var(--color-accent)]"
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="w-16 shrink-0 text-right font-mono text-[11px] text-muted">{display}</span>
    </div>
  );
}

/**
 * Owner customer directory + insights (Square parity, quick-win #3). Read-only,
 * venue-scoped. All data is aggregated from THIS venue's confirmed orders by
 * getVenueCustomers — the diner identity firewall is never crossed (no read of
 * the customers auth table, no cross-venue data). No writes, no money path.
 */
export default async function CustomersPage() {
  await requireUser();
  const venue = await requireVenue();
  const stats = await getVenueCustomers(venue.id);

  const empty = stats.totalCustomers === 0;
  const repeatRate =
    stats.totalCustomers > 0
      ? Math.round((stats.repeatCount / stats.totalCustomers) * 100)
      : 0;
  const topSpenders = stats.customers.slice(0, 6);
  const topMax = Math.max(1, ...topSpenders.map((c) => c.totalCents));
  const tableRows = stats.customers.slice(0, CUSTOMER_TABLE_CAP);
  const truncated = stats.customers.length - tableRows.length;

  return (
    <main className="mx-auto w-full max-w-[1600px]">
      <PageHeader
        title="Customers"
        description={`${stats.totalCustomers} ${
          stats.totalCustomers === 1 ? "customer" : "customers"
        } · last 12 months`}
      />

      <div className="space-y-6 px-5 py-8">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label="Customers"
            value={String(stats.totalCustomers)}
            sub="Last 12 months"
          />
          <Kpi
            label="Repeat rate"
            value={`${repeatRate}%`}
            sub={`${stats.repeatCount} ordered again`}
          />
          <Kpi
            label="Avg spend"
            value={`$${formatCents(stats.avgSpendCents)}`}
            sub="Per customer"
          />
          <Kpi
            label="New this month"
            value={String(stats.newThisPeriod)}
            sub="First order in 30 days"
          />
        </div>

        {empty ? (
          <section className="rounded-card border border-line bg-surface-elevated p-8 text-center shadow-card">
            <p className="font-display text-lg font-semibold text-ink">
              No customers yet
            </p>
            <p className="mt-1 text-sm text-muted">
              Confirmed orders from your storefront will show up here, grouped
              into customers.
            </p>
          </section>
        ) : (
          <>
            <section className="rounded-card border border-line bg-surface-elevated p-5 shadow-card">
              <p className={eyebrow}>Top spenders</p>
              <div className="mt-3">
                {topSpenders.map((c) => (
                  <BarRow
                    key={c.key}
                    label={c.name}
                    value={c.totalCents}
                    max={topMax}
                    display={`$${formatCents(c.totalCents)}`}
                  />
                ))}
              </div>
            </section>

            <section className="overflow-hidden rounded-card border border-line bg-surface-elevated shadow-card">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-line">
                      <th className={th}>Customer</th>
                      <th className={th}>Phone</th>
                      <th className={thRight}>Orders</th>
                      <th className={thRight}>Total spent</th>
                      <th className={thRight}>Avg order</th>
                      <th className={thRight}>Last order</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((c) => (
                      <tr key={c.key} className="border-b border-line/60 last:border-0">
                        <td className="max-w-[12rem] truncate px-4 py-2.5 font-medium text-ink">
                          {c.name}
                        </td>
                        <td className="px-4 py-2.5 text-muted">
                          {c.phone ? (
                            <a
                              href={`tel:${c.phone}`}
                              className="hover:text-[var(--action)] hover:underline"
                            >
                              {c.phone}
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-ink">
                          {c.orders}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-ink">
                          ${formatCents(c.totalCents)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-muted">
                          ${formatCents(c.avgCents)}
                        </td>
                        <td
                          className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-muted"
                          suppressHydrationWarning
                        >
                          {c.lastOrderAt.toLocaleDateString("en-AU", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {truncated > 0 ? (
              <p className="text-xs text-muted">
                Showing the top {CUSTOMER_TABLE_CAP} by spend of{" "}
                {stats.totalCustomers} customers.
              </p>
            ) : null}
            <p className="text-xs text-muted">
              Customers are grouped from your confirmed orders in the last 12
              months — by sign-in first, then phone number, then name. Guests who
              didn&rsquo;t sign in are matched best-effort, so counts are a close
              guide rather than an exact identity.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
