import type { Metadata } from "next";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";

import { Card } from "@/app/_components/card";
import { PageHeader } from "@/app/_components/page-header";
import { db } from "@/lib/db";
import { orders, promotions } from "@/lib/db/schema";
import { requireUser, requireVenue, scopedToVenue } from "@/lib/tenant";
import { formatCents } from "@/lib/validation";

import { setOwnerDiscountActive } from "./actions";
import { DiscountForm } from "./discount-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Discounts" };

const eyebrow =
  "font-mono text-[9px] font-bold uppercase tracking-wider text-label";

function valueLabel(type: "percent" | "amount", value: number): string {
  return type === "percent" ? `${value}% off` : `$${formatCents(value)} off`;
}

export default async function DiscountsPage() {
  await requireUser();
  const venue = await requireVenue();

  const promos = await db
    .select({
      id: promotions.id,
      name: promotions.name,
      code: promotions.code,
      type: promotions.type,
      value: promotions.value,
      minBasketCents: promotions.minBasketCents,
      audience: promotions.audience,
      endsAt: promotions.endsAt,
      isActive: promotions.isActive,
    })
    .from(promotions)
    .where(eq(promotions.ownerVenueId, venue.id))
    .orderBy(desc(promotions.createdAt));

  // Redemptions + total discount given per code (this venue's confirmed orders).
  const ids = promos.map((p) => p.id);
  const usage = ids.length
    ? await db
        .select({
          promoId: orders.appliedPromoId,
          redemptions: count(),
          given: sql<number>`coalesce(sum(${orders.promoDiscountCents}), 0)`,
        })
        .from(orders)
        .where(
          and(
            scopedToVenue(orders.venueId, venue.id),
            eq(orders.status, "confirmed"),
            inArray(orders.appliedPromoId, ids),
          ),
        )
        .groupBy(orders.appliedPromoId)
    : [];
  const usageById = new Map(
    usage.map((u) => [u.promoId, { redemptions: u.redemptions, given: Number(u.given) }]),
  );

  return (
    <main className="mx-auto max-w-3xl">
      <PageHeader
        title="Discounts"
        description="Create codes diners enter at checkout"
      />

      <div className="space-y-6 px-5 py-8">
        <Card>
          <DiscountForm />
        </Card>

        <section className="space-y-3">
          <p className={eyebrow}>Your codes</p>
          {promos.length === 0 ? (
            <Card>
              <p className="text-sm text-muted">
                No codes yet. Create one above — diners enter it at checkout to
                get the discount, and you&rsquo;ll see redemptions here.
              </p>
            </Card>
          ) : (
            <ul className="space-y-2">
              {promos.map((p) => {
                const u = usageById.get(p.id) ?? { redemptions: 0, given: 0 };
                return (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card border border-line bg-surface-elevated p-4 shadow-card"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded-input bg-sand px-2 py-0.5 font-mono text-sm font-bold tracking-wide text-ink">
                          {p.code}
                        </span>
                        <span
                          className={`rounded-pill px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider ${
                            p.isActive
                              ? "bg-[var(--color-success)]/15 text-success-deep"
                              : "bg-line text-muted"
                          }`}
                        >
                          {p.isActive ? "Active" : "Paused"}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-sm font-medium text-ink">
                        {p.name}
                      </p>
                      <p className="font-mono text-[11px] text-muted">
                        {valueLabel(p.type, p.value)}
                        {p.minBasketCents > 0
                          ? ` · min $${formatCents(p.minBasketCents)}`
                          : ""}
                        {p.audience === "new" ? " · new customers" : ""}
                        {p.endsAt ? (
                          <span suppressHydrationWarning>
                            {" "}
                            · ends{" "}
                            {p.endsAt.toLocaleDateString("en-AU", {
                              day: "numeric",
                              month: "short",
                            })}
                          </span>
                        ) : null}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="font-display text-sm font-extrabold text-ink">
                        {u.redemptions} used
                      </p>
                      <p className="font-mono text-[10px] text-muted">
                        ${formatCents(u.given)} given
                      </p>
                    </div>

                    <form action={setOwnerDiscountActive}>
                      <input type="hidden" name="id" value={p.id} />
                      <input
                        type="hidden"
                        name="active"
                        value={p.isActive ? "false" : "true"}
                      />
                      <button
                        type="submit"
                        className="rounded-control border border-line-strong bg-surface-elevated px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-hover-secondary"
                      >
                        {p.isActive ? "Pause" : "Resume"}
                      </button>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
