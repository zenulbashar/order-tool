import type { Metadata } from "next";
import Link from "next/link";
import { desc } from "drizzle-orm";

import { StatusBadge } from "@/app/_components/status-badge";
import { db } from "@/lib/db";
import { promotions } from "@/lib/db/schema";
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
 * Platform promotions console (Track E2d, admin-only). Create and pause
 * campaigns; the diner-side discount is applied server-side at checkout by the
 * single order-discount recompute, stacked with the pay-by-bank saving. v1 is
 * platform-wide (all venues).
 */
export default async function AdminPromotionsPage() {
  await requirePlatformAdmin();

  const rows = await db.select().from(promotions).orderBy(desc(promotions.createdAt));

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
          Platform-wide order discounts. Applied automatically at checkout and
          stacked with any pay-by-bank saving — never a surcharge.
        </p>
      </header>

      {/* New promotion */}
      <section className="mb-8 rounded-card border border-line bg-surface-elevated p-5 shadow-card">
        <p className={eyebrow}>New promotion</p>
        <form action={createPromotion} className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
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
            <span className={eyebrow}>Funding</span>
            <select name="fundingSource" defaultValue="merchant" className={`${control} mt-1`}>
              <option value="merchant">Merchant</option>
              <option value="platform">Platform</option>
              <option value="cofunded">Co-funded</option>
            </select>
          </label>
          <label className="block">
            <span className={eyebrow}>Starts</span>
            <input type="date" name="startsAt" className={`${control} mt-1`} />
          </label>
          <label className="block">
            <span className={eyebrow}>Ends</span>
            <input type="date" name="endsAt" className={`${control} mt-1`} />
          </label>
          <div className="col-span-2 flex items-end sm:col-span-4">
            <button
              type="submit"
              className="rounded-control bg-forest px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Create promotion
            </button>
          </div>
        </form>
        <p className="mt-2 text-[11px] text-muted">
          Funding is recorded for reporting; the discount is charged to whoever
          you set here. The platform application fee is charged on the discounted
          total.
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
              {rows.map((promo) => (
                <li
                  key={promo.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 px-4 py-3 last:border-0"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-bold text-ink">{promo.name}</span>
                      <StatusBadge tone={promo.isActive ? "ready" : "cancelled"}>
                        {promo.isActive ? "active" : "paused"}
                      </StatusBadge>
                    </span>
                    <span className="font-mono text-[10px] text-muted">
                      {promo.type === "percent"
                        ? `${promo.value}% off`
                        : `$${formatCents(promo.value)} off`}
                      {promo.minBasketCents > 0 ? ` · min $${formatCents(promo.minBasketCents)}` : ""}
                      {` · ${promo.fundingSource}`}
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
              ))}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}
