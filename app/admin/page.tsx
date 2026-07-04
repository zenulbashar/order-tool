import type { Metadata } from "next";
import Link from "next/link";
import { and, count, desc, eq, gt, sql } from "drizzle-orm";

import { StatusBadge } from "@/app/_components/status-badge";
import { db } from "@/lib/db";
import {
  integrationJobs,
  orders,
  platformAuditLog,
  venueIntegrations,
  venues,
} from "@/lib/db/schema";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { getSquareFeeMode } from "@/lib/platform-settings";

import { updateSquareFeeMode } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Platform admin" };

/** Directory is bounded — revisit with pagination if the fleet outgrows it. */
const VENUE_LIMIT = 200;
const ORDER_WINDOW_DAYS = 30;
const AUDIT_LIMIT = 20;

const eyebrow =
  "font-mono text-[9px] font-bold uppercase tracking-wider text-label";

function timeAgo(from: Date, now: number): string {
  const mins = Math.floor((now - from.getTime()) / 60_000);
  if (mins < 60) return `${Math.max(mins, 0)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Platform admin console (Track E). OPERATOR-ONLY — gated by the
 * PLATFORM_ADMIN_EMAILS allowlist (requirePlatformAdmin; non-admins 404).
 * Cross-tenant reads are intentional and confined to this route: a venues
 * directory (plan/status/volume), integrations fleet health (the
 * venue_integrations health fields + dead jobs Track 0 built for exactly this),
 * and the first platform setting — the D1 square_fee_mode switch — with its
 * audit trail. Reads + one audited setting write; nothing here can touch the
 * order money path.
 */
export default async function AdminConsolePage() {
  await requirePlatformAdmin();

  const now = new Date().getTime();
  const since = new Date(now - ORDER_WINDOW_DAYS * 86_400_000);

  const [venueRows, orderCounts, integrations, deadJobs, feeMode, audit] =
    await Promise.all([
      db
        .select({
          id: venues.id,
          name: venues.name,
          slug: venues.slug,
          plan: venues.plan,
          planStatus: venues.planStatus,
          chargesEnabled: venues.stripeChargesEnabled,
          isLive: sql<boolean>`${venues.onboardingCompletedAt} is not null`,
          createdAt: venues.createdAt,
        })
        .from(venues)
        .orderBy(desc(venues.createdAt))
        .limit(VENUE_LIMIT),
      db
        .select({ venueId: orders.venueId, value: count() })
        .from(orders)
        .where(
          and(eq(orders.status, "confirmed"), gt(orders.createdAt, since)),
        )
        .groupBy(orders.venueId),
      db
        .select({
          venueId: venueIntegrations.venueId,
          provider: venueIntegrations.provider,
          status: venueIntegrations.status,
          consecutiveFailures: venueIntegrations.consecutiveFailures,
          lastSuccessAt: venueIntegrations.lastSuccessAt,
          lastError: venueIntegrations.lastError,
        })
        .from(venueIntegrations),
      db
        .select({ venueId: integrationJobs.venueId, value: count() })
        .from(integrationJobs)
        .where(eq(integrationJobs.status, "dead"))
        .groupBy(integrationJobs.venueId),
      getSquareFeeMode(),
      db
        .select()
        .from(platformAuditLog)
        .orderBy(desc(platformAuditLog.createdAt))
        .limit(AUDIT_LIMIT),
    ]);

  const ordersByVenue = new Map(orderCounts.map((r) => [r.venueId, r.value]));
  const deadByVenue = new Map(deadJobs.map((r) => [r.venueId, r.value]));
  const integrationsByVenue = new Map<string, typeof integrations>();
  for (const row of integrations) {
    const list = integrationsByVenue.get(row.venueId) ?? [];
    list.push(row);
    integrationsByVenue.set(row.venueId, list);
  }
  const venueNameById = new Map(venueRows.map((v) => [v.id, v.name]));

  const attention = integrations.filter(
    (row) =>
      row.status === "needs_attention" ||
      row.status === "revoked" ||
      row.consecutiveFailures > 0 ||
      (deadByVenue.get(row.venueId) ?? 0) > 0,
  );

  const liveCount = venueRows.filter((v) => v.isLive).length;
  const payingCount = venueRows.filter(
    (v) => v.plan === "pro" || v.plan === "scale",
  ).length;

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <header className="mb-6">
        <p className={eyebrow}>prompt2eat · operators only</p>
        <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-ink">
          Platform admin
        </h1>
        <p className="mt-1 text-sm text-muted">
          {venueRows.length} venue{venueRows.length === 1 ? "" : "s"} ·{" "}
          {liveCount} live · {payingCount} paying
        </p>
        <nav className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/admin/stats"
            className="inline-flex items-center gap-1.5 rounded-control border border-line-strong px-3 py-1.5 text-xs font-bold text-ink transition hover:bg-hover-secondary"
          >
            Stats →
          </Link>
          <Link
            href="/admin/promotions"
            className="inline-flex items-center gap-1.5 rounded-control border border-line-strong px-3 py-1.5 text-xs font-bold text-ink transition hover:bg-hover-secondary"
          >
            Promotions →
          </Link>
          <Link
            href="/admin/marketplace"
            className="inline-flex items-center gap-1.5 rounded-control border border-line-strong px-3 py-1.5 text-xs font-bold text-ink transition hover:bg-hover-secondary"
          >
            Marketplace →
          </Link>
        </nav>
      </header>

      {/* Fleet integrations health — the cross-venue view Track 0's health
          fields were built for. Empty = everything healthy. */}
      <section className="mb-6 overflow-hidden rounded-card border border-line bg-surface-elevated shadow-card">
        <div className="border-b border-line bg-hover-secondary px-4 py-2.5">
          <p className={eyebrow}>
            Integrations needing attention ({attention.length})
          </p>
        </div>
        {attention.length === 0 ? (
          <p className="px-4 py-5 text-center text-sm text-muted">
            Every connected integration is healthy — no failures, no dead jobs.
          </p>
        ) : (
          <ul>
            {attention.map((row) => (
              <li
                key={`${row.venueId}-${row.provider}`}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 px-4 py-3 last:border-0"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-bold text-ink">
                    {venueNameById.get(row.venueId) ?? row.venueId}
                  </span>
                  <span className="rounded-[5px] bg-sand px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider text-muted">
                    {row.provider}
                  </span>
                  <StatusBadge
                    tone={row.status === "active" ? "ready" : "failed"}
                  >
                    {row.status.replace("_", " ")}
                  </StatusBadge>
                </span>
                <span className="font-mono text-[11px] text-muted">
                  {row.consecutiveFailures > 0
                    ? `${row.consecutiveFailures} consecutive failures · `
                    : ""}
                  {(deadByVenue.get(row.venueId) ?? 0) > 0
                    ? `${deadByVenue.get(row.venueId)} dead jobs · `
                    : ""}
                  {row.lastError ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Venues directory. */}
      <section className="mb-6 overflow-hidden rounded-card border border-line bg-surface-elevated shadow-card">
        <div className="grid grid-cols-[1.8fr_0.8fr_0.9fr_0.9fr_1fr_0.9fr] gap-3 border-b border-line bg-hover-secondary px-4 py-2.5">
          {["Venue", "Plan", "Charges", `Orders · ${ORDER_WINDOW_DAYS}d`, "Integrations", "Joined"].map(
            (heading) => (
              <span key={heading} className={eyebrow}>
                {heading}
              </span>
            ),
          )}
        </div>
        <ul>
          {venueRows.map((venue) => {
            const vIntegrations = integrationsByVenue.get(venue.id) ?? [];
            return (
              <li
                key={venue.id}
                className="grid grid-cols-[1.8fr_0.8fr_0.9fr_0.9fr_1fr_0.9fr] items-center gap-3 border-b border-line/60 px-4 py-3 text-sm last:border-0"
              >
                <span className="min-w-0">
                  <Link
                    href={`/admin/venues/${venue.id}`}
                    className="block truncate font-bold text-ink hover:text-[var(--action)]"
                  >
                    {venue.name}
                  </Link>
                  <span className="font-mono text-[10px] text-muted">
                    /{venue.slug}
                    {venue.isLive ? "" : " · not live"}
                  </span>
                </span>
                <span className="font-mono text-[11px] font-bold uppercase text-ink">
                  {venue.plan}
                </span>
                <span>
                  <StatusBadge tone={venue.chargesEnabled ? "paid" : "done"}>
                    {venue.chargesEnabled ? "Enabled" : "Off"}
                  </StatusBadge>
                </span>
                <span className="font-display text-[13px] font-extrabold text-ink">
                  {ordersByVenue.get(venue.id) ?? 0}
                </span>
                <span className="flex flex-wrap gap-1">
                  {vIntegrations.length === 0 ? (
                    <span className="text-xs text-muted">—</span>
                  ) : (
                    vIntegrations.map((row) => (
                      <span
                        key={row.provider}
                        className="rounded-[5px] bg-sand px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider text-muted"
                      >
                        {row.provider}: {row.status}
                      </span>
                    ))
                  )}
                </span>
                <span className="font-mono text-[11px] text-muted">
                  {timeAgo(venue.createdAt, now)}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* D1 — the square fee mode switch, the first console-owned setting. */}
        <section className="rounded-card border border-line bg-surface-elevated p-5 shadow-card">
          <p className={eyebrow}>Platform settings</p>
          <h2 className="mt-1.5 text-sm font-bold text-ink">
            Square non-Square-tender fee (1%)
          </h2>
          <p className="mt-1 text-xs text-muted">
            Who wears Square&apos;s 1% Orders-API fee on mirrored orders. Copy
            and commercial terms only — neither mode adds any customer-facing
            fee, and nothing on the order money path reads this.
          </p>
          <form action={updateSquareFeeMode} className="mt-4 space-y-2">
            {(
              [
                {
                  value: "absorbed",
                  label: "Platform absorbs it",
                  sub: "Venue copy: order mirroring is included in your plan.",
                },
                {
                  value: "passed_through",
                  label: "Passed through to venues",
                  sub: "Venue copy: Square's 1% fee applies to mirrored orders.",
                },
              ] as const
            ).map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-start gap-2.5 rounded-input border border-line px-3 py-2.5 has-[:checked]:border-forest has-[:checked]:bg-hover-secondary"
              >
                <input
                  type="radio"
                  name="mode"
                  value={option.value}
                  defaultChecked={feeMode === option.value}
                  className="mt-0.5 accent-[var(--color-forest)]"
                />
                <span>
                  <span className="block text-sm font-bold text-ink">
                    {option.label}
                  </span>
                  <span className="block text-xs text-muted">{option.sub}</span>
                </span>
              </label>
            ))}
            <button
              type="submit"
              className="rounded-control bg-forest px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Save
            </button>
          </form>
        </section>

        {/* Audit trail — append-only record of every console change. */}
        <section className="rounded-card border border-line bg-surface-elevated p-5 shadow-card">
          <p className={eyebrow}>Audit log</p>
          {audit.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              No admin actions recorded yet.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {audit.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-start justify-between gap-3 border-b border-line/60 pb-2 text-sm last:border-0"
                >
                  <span className="min-w-0">
                    <span className="block font-medium text-ink">
                      {entry.action}
                      {entry.detail ? (
                        <span className="text-muted"> · {entry.detail}</span>
                      ) : null}
                    </span>
                    <span className="font-mono text-[10px] text-muted">
                      {entry.actorEmail}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-muted">
                    {timeAgo(entry.createdAt, now)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
