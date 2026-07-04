import type { Metadata } from "next";
import Link from "next/link";
import { asc, desc, eq, sql } from "drizzle-orm";

import { StatusBadge } from "@/app/_components/status-badge";
import { db } from "@/lib/db";
import { orders, promotions, promotionVenues, venues } from "@/lib/db/schema";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { formatCents } from "@/lib/validation";

import { createPromotion, setPromotionActive } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Promotions · admin" };

const eyebrow = "font-mono text-[9px] font-bold uppercase tracking-wider text-label";
const control =
  "w-full rounded-input border border-line bg-surface-elevated px-2.5 py-2 text-sm text-ink shadow-sm focus-visible:border-[var(--color-accent)] focus-visible:shadow-[var(--focus-ring-input)] focus-visible:outline-none";

function fmtDate(d: Date | null): string {
  return d ? d.toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "—";
}

/**
 * Platform promotions console (Track E2d + E2d-2, admin-only). Create/pause
 * campaigns with per-venue targeting, a new-customer audience, and a soft spend
 * cap. The diner-side discount is applied server-side at checkout by the single
 * order-discount recompute, stacked with the pay-by-bank saving.
 */
export default async function AdminPromotionsPage() {
  await requirePlatformAdmin();

  const [rows, venueRows, spentRows, targetRows] = await Promise.all([
    db.select().from(promotions).orderBy(desc(promotions.createdAt)),
    db
      .select({ id: venues.id, name: venues.name })
      .from(venues)
      .orderBy(asc(venues.name)),
    // Confirmed spend + platform-funded liability per promo.
    db
      .select({
        promoId: orders.appliedPromoId,
        spent: sql<number>`coalesce(sum(${orders.promoDiscountCents}), 0)`,
        funded: sql<number>`coalesce(sum(${orders.platformFundedCents}), 0)`,
      })
      .from(orders)
      .where(eq(orders.status, "confirmed"))
      .groupBy(orders.appliedPromoId),
    // Targeted-venue count per promo.
    db
      .select({
        promotionId: promotionVenues.promotionId,
        n: sql<number>`count(*)`,
      })
      .from(promotionVenues)
      .groupBy(promotionVenues.promotionId),
  ]);

  const spentByPromo = new Map(spentRows.filter((r) => r.promoId).map((r) => [r.promoId as string, Number(r.spent)]));
  const fundedByPromo = new Map(spentRows.filter((r) => r.promoId).map((r) => [r.promoId as string, Number(r.funded)]));
  const targetsByPromo = new Map(targetRows.map((r) => [r.promotionId, Number(r.n)]));
  const platformOwed = [...fundedByPromo.values()].reduce((s, v) => s + v, 0);

  return (
    <main className="mx-auto max-w-4xl px-5 py-8">
      <header className="mb-6">
        <Link href="/admin" className="text-xs font-medium text-[var(--action)] hover:opacity-80">
          ← Admin
        </Link>
        <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-ink">
          Promotions
        </h1>
        <p className="mt-1 text-sm text-muted">
          Order discounts applied automatically at checkout and stacked with any
          pay-by-bank saving — never a surcharge.
          {platformOwed > 0 ? (
            <span className="ml-1 font-semibold text-ink">
              Platform co-funding owed to venues: ${formatCents(platformOwed)}{" "}
              (settled out of band).
            </span>
          ) : null}
        </p>
      </header>

      {/* New promotion */}
      <section className="mb-8 rounded-card border border-line bg-surface-elevated p-5 shadow-card">
        <p className={eyebrow}>New promotion</p>
        <form action={createPromotion} className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="col-span-2 block">
              <span className={eyebrow}>Name</span>
              <input name="name" required placeholder="Launch week" className={`${control} mt-1`} />
            </label>
            <label className="block">
              <span className={eyebrow}>Type</span>
              <select name="type" defaultValue="percent" className={`${control} mt-1`}>
                <option value="percent">% off</option>
                <option value="amount">$ off</option>
              </select>
            </label>
            <label className="block">
              <span className={eyebrow}>Value</span>
              <input name="value" inputMode="decimal" required placeholder="10" className={`${control} mt-1`} />
            </label>
            <label className="block">
              <span className={eyebrow}>Min basket ($)</span>
              <input name="minBasket" inputMode="decimal" placeholder="0" className={`${control} mt-1`} />
            </label>
            <label className="block">
              <span className={eyebrow}>Budget cap ($)</span>
              <input name="budget" inputMode="decimal" placeholder="none" className={`${control} mt-1`} />
            </label>
            <label className="block">
              <span className={eyebrow}>Audience</span>
              <select name="audience" defaultValue="all" className={`${control} mt-1`}>
                <option value="all">Everyone</option>
                <option value="new">New customers</option>
              </select>
            </label>
            <label className="block">
              <span className={eyebrow}>Funding</span>
              <select name="fundingSource" defaultValue="merchant" className={`${control} mt-1`}>
                <option value="merchant">Merchant</option>
                <option value="platform">Platform</option>
                <option value="cofunded">Co-funded</option>
              </select>
            </label>
            <label className="block">
              <span className={eyebrow}>Platform % (co-funded)</span>
              <input name="platformPercent" inputMode="numeric" placeholder="50" className={`${control} mt-1`} />
            </label>
            <label className="block">
              <span className={eyebrow}>Starts</span>
              <input type="date" name="startsAt" className={`${control} mt-1`} />
            </label>
            <label className="block">
              <span className={eyebrow}>Ends</span>
              <input type="date" name="endsAt" className={`${control} mt-1`} />
            </label>
          </div>

          {/* Targeting — leave all unchecked for platform-wide. */}
          <details className="rounded-input border border-dashed border-line px-3 py-2">
            <summary className="cursor-pointer text-xs font-semibold text-muted">
              Target specific venues (default: all)
            </summary>
            <div className="mt-2 grid max-h-40 grid-cols-2 gap-1.5 overflow-y-auto sm:grid-cols-3">
              {venueRows.map((venue) => (
                <label key={venue.id} className="flex items-center gap-1.5 text-xs text-ink">
                  <input type="checkbox" name="venues" value={venue.id} className="accent-[var(--color-forest)]" />
                  <span className="truncate">{venue.name}</span>
                </label>
              ))}
            </div>
          </details>

          <button
            type="submit"
            className="rounded-control bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-forest transition hover:opacity-90"
          >
            Create promotion
          </button>
        </form>
        <p className="mt-2 text-[11px] text-muted">
          Budget is a soft cap on confirmed-order discounts. Funding is recorded
          for reporting; the platform fee is charged on the discounted total.
        </p>
      </section>

      {/* Existing */}
      <section>
        <p className={`${eyebrow} mb-2`}>All promotions</p>
        {rows.length === 0 ? (
          <p className="text-sm text-muted">No promotions yet.</p>
        ) : (
          <div className="overflow-hidden rounded-card border border-line bg-surface-elevated shadow-card">
            <ul>
              {rows.map((promo) => {
                const spent = spentByPromo.get(promo.id) ?? 0;
                return (
                  <li
                    key={promo.id}
                    className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 px-4 py-3 last:border-0"
                  >
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-bold text-ink">{promo.name}</span>
                        <StatusBadge tone={promo.isActive ? "ready" : "cancelled"}>
                          {promo.isActive ? "active" : "paused"}
                        </StatusBadge>
                        {promo.audience === "new" ? (
                          <span className="rounded-[5px] bg-sand px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider text-muted">
                            New only
                          </span>
                        ) : null}
                      </span>
                      <span className="font-mono text-[10px] text-muted">
                        {promo.type === "percent" ? `${promo.value}% off` : `$${formatCents(promo.value)} off`}
                        {promo.minBasketCents > 0 ? ` · min $${formatCents(promo.minBasketCents)}` : ""}
                        {promo.scope === "selected" ? ` · ${targetsByPromo.get(promo.id) ?? 0} venues` : " · all venues"}
                        {promo.budgetCents != null
                          ? ` · $${formatCents(spent)}/$${formatCents(promo.budgetCents)}`
                          : ` · $${formatCents(spent)} used`}
                        {promo.fundingSource !== "merchant"
                          ? ` · ${promo.fundingSource} ${promo.platformFundedPercent}% (owe $${formatCents(fundedByPromo.get(promo.id) ?? 0)})`
                          : ""}
                        {` · ${fmtDate(promo.startsAt)}–${fmtDate(promo.endsAt)}`}
                      </span>
                    </span>
                    <form action={setPromotionActive}>
                      <input type="hidden" name="id" value={promo.id} />
                      <input type="hidden" name="isActive" value={promo.isActive ? "off" : "on"} />
                      <button
                        type="submit"
                        className="rounded-control border border-line-strong px-2.5 py-1 text-xs font-bold text-ink transition hover:bg-hover-secondary"
                      >
                        {promo.isActive ? "Pause" : "Activate"}
                      </button>
                    </form>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}
