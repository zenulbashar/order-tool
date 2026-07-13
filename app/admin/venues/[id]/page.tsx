import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";

import { StatusBadge } from "@/app/_components/status-badge";
import { db } from "@/lib/db";
import { menuCategories, menuItems, venues } from "@/lib/db/schema";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { formatCents } from "@/lib/validation";

import { openVenueAsAdmin } from "../../actions";
import { setVenueItemPrice } from "./actions";
import { PlanDiscountForm } from "./plan-discount-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Venue · admin" };

const eyebrow = "font-mono text-[9px] font-bold uppercase tracking-wider text-label";

type Params = { params: Promise<{ id: string }> };

export default async function AdminVenuePage({ params }: Params) {
  await requirePlatformAdmin();
  const { id } = await params;

  const [venue] = await db.select().from(venues).where(eq(venues.id, id)).limit(1);
  if (!venue) notFound();

  const items = await db
    .select({
      id: menuItems.id,
      name: menuItems.name,
      priceCents: menuItems.priceCents,
      isAvailable: menuItems.isAvailable,
      categoryName: menuCategories.name,
    })
    .from(menuItems)
    .innerJoin(menuCategories, eq(menuCategories.id, menuItems.categoryId))
    .where(eq(menuItems.venueId, venue.id))
    .orderBy(asc(menuCategories.sortOrder), asc(menuItems.sortOrder));

  return (
    <main className="mx-auto max-w-4xl px-5 py-8">
      <header className="mb-6">
        <Link href="/admin" className="text-xs font-medium text-[var(--action)] hover:opacity-80">
          ← Admin
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">
            {venue.name}
          </h1>
          <StatusBadge tone={venue.stripeChargesEnabled ? "paid" : "done"}>
            {venue.plan}
          </StatusBadge>
        </div>
        <p className="mt-1 font-mono text-xs text-muted">/{venue.slug}</p>
        {/* Open the owner dashboard scoped to this venue (audited support tool). */}
        <form action={openVenueAsAdmin} className="mt-3">
          <input type="hidden" name="venueId" value={venue.id} />
          <button
            type="submit"
            className="rounded-control border border-line-strong px-3 py-1.5 text-xs font-bold text-ink transition hover:bg-hover-secondary"
          >
            Open owner dashboard as this venue →
          </button>
        </form>
      </header>

      {/* Plan fee discount (E2c). */}
      <section className="mb-6 rounded-card border border-line bg-surface-elevated p-5 shadow-card">
        <p className={eyebrow}>Subscription fee</p>
        <h2 className="mt-1.5 text-sm font-bold text-ink">Per-venue discount</h2>
        <p className="mt-1 text-xs text-muted">
          Give this venue a deal on their monthly {venue.plan} fee — applied as a
          Stripe coupon on their subscription. Only ever reduces the fee; fully
          reversible.
          {venue.planDiscountMode !== "off" ? (
            <span className="ml-1 font-semibold text-success-deep">
              Currently:{" "}
              {venue.planDiscountMode === "percent"
                ? `${venue.planDiscountValue}% off`
                : `$${formatCents(venue.planDiscountValue)}/mo off`}
              .
            </span>
          ) : null}
        </p>
        <PlanDiscountForm
          venueId={venue.id}
          mode={venue.planDiscountMode}
          value={venue.planDiscountValue}
          hasSubscription={Boolean(venue.stripeSubscriptionId)}
        />
      </section>

      {/* Menu prices (E2b). */}
      <section className="rounded-card border border-line bg-surface-elevated shadow-card">
        <div className="border-b border-line bg-hover-secondary px-4 py-2.5">
          <p className={eyebrow}>Menu prices ({items.length})</p>
        </div>
        {items.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted">No menu items.</p>
        ) : (
          <ul>
            {items.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 px-4 py-2.5 last:border-0"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-ink">
                    {item.name}
                    {!item.isAvailable ? (
                      <span className="ml-2 font-mono text-[9px] font-bold uppercase text-muted">
                        hidden
                      </span>
                    ) : null}
                  </span>
                  <span className="font-mono text-[10px] text-muted">{item.categoryName}</span>
                </span>
                <form action={setVenueItemPrice} className="flex items-center gap-2">
                  <input type="hidden" name="venueId" value={venue.id} />
                  <input type="hidden" name="itemId" value={item.id} />
                  <span className="text-sm text-muted">$</span>
                  <input
                    name="price"
                    inputMode="decimal"
                    defaultValue={formatCents(item.priceCents)}
                    aria-label={`Price of ${item.name}`}
                    className="w-20 rounded-input border border-line bg-surface-elevated px-2 py-1 text-right text-sm text-ink focus-visible:border-[var(--color-accent)] focus-visible:shadow-[var(--focus-ring-input)] focus-visible:outline-none"
                  />
                  <button
                    type="submit"
                    className="rounded-control border border-line-strong px-2.5 py-1 text-xs font-bold text-ink transition hover:bg-hover-secondary"
                  >
                    Save
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-3 text-xs text-muted">
        Price changes affect only future orders — placed orders keep their
        snapshot. Every change here is recorded in the admin audit log.
      </p>
    </main>
  );
}
