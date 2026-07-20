import { and, asc, desc, eq, ne } from "drizzle-orm";

import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { db } from "@/lib/db";
import { marketplaceOrders, marketplaceProducts } from "@/lib/db/schema";
import { requireUser, requireVenue, scopedToVenue } from "@/lib/tenant";
import { formatCents } from "@/lib/validation";

import { ShopClient, type ShopProduct } from "./shop-client";

export const dynamic = "force-dynamic";

const STATUS_TONE = {
  requested: "processing",
  confirmed: "ready",
  shipped: "paid",
  cancelled: "cancelled",
  // Never rendered (pending_payment rows are filtered from the list) — present
  // only so indexing the map by the enum type type-checks.
  pending_payment: "processing",
} as const;

/**
 * Hardware marketplace — venue side (Track F). Browse the platform catalog
 * (curated in the admin console) and request an order. v1 is invoice-later: no
 * card is charged, so this never touches the diner money path. Owner-only
 * surface; orders are venue-scoped.
 */
export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; error?: string }>;
}) {
  await requireUser();
  const venue = await requireVenue();
  const params = await searchParams;

  const [products, orders] = await Promise.all([
    db
      .select()
      .from(marketplaceProducts)
      .where(eq(marketplaceProducts.isActive, true))
      .orderBy(asc(marketplaceProducts.category), asc(marketplaceProducts.name)),
    db
      .select()
      .from(marketplaceOrders)
      // Only PAID orders belong in the list — an abandoned checkout leaves a
      // pending_payment row that never became a real order.
      .where(
        and(
          scopedToVenue(marketplaceOrders.venueId, venue.id),
          ne(marketplaceOrders.status, "pending_payment"),
        ),
      )
      .orderBy(desc(marketplaceOrders.createdAt))
      .limit(10),
  ]);

  const shopProducts: ShopProduct[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    category: p.category,
    priceCents: p.priceCents,
    unitLabel: p.unitLabel,
    supplier: p.supplier,
    imageUrl: p.imageUrl,
  }));

  return (
    <main className="mx-auto w-full max-w-[1600px]">
      <PageHeader title="Shop" description="Hardware & supplies for your venue" />

      {params.checkout === "success" ? (
        <div className="mx-5 mt-6 rounded-card border border-[var(--color-success)]/30 bg-[var(--color-success)]/8 px-4 py-3 text-sm text-success-deep">
          Payment received — we&apos;ll confirm and ship your order. It&apos;ll
          appear under &ldquo;Your orders&rdquo; below in a moment.
        </div>
      ) : null}
      {params.checkout === "cancel" ? (
        <div className="mx-5 mt-6 rounded-card border border-line bg-surface-elevated px-4 py-3 text-sm text-muted">
          Checkout cancelled — your cart wasn&apos;t charged.
        </div>
      ) : null}
      {params.error === "checkout" ? (
        <div className="mx-5 mt-6 rounded-card border border-[var(--color-warm)]/40 bg-[var(--color-warm)]/10 px-4 py-3 text-sm text-ink">
          We couldn&apos;t start checkout just then. Please try again.
        </div>
      ) : null}

      {shopProducts.length === 0 ? (
        <div className="px-5 py-8">
          <div className="rounded-card border border-dashed border-line p-8 text-center text-sm text-muted">
            The shop is being stocked — check back soon for signage, tablets,
            stands and more.
          </div>
        </div>
      ) : (
        <ShopClient products={shopProducts} />
      )}

      {orders.length > 0 ? (
        <section className="px-5 pb-10">
          <p className="mb-2 font-mono text-[9px] font-bold uppercase tracking-wider text-label">
            Your orders
          </p>
          <div className="overflow-hidden rounded-card border border-line bg-surface-elevated shadow-card">
            <ul>
              {orders.map((order) => (
                <li
                  key={order.id}
                  className="flex items-center justify-between gap-3 border-b border-line/60 px-4 py-3 text-sm last:border-0"
                >
                  <span className="flex items-center gap-2">
                    <StatusBadge tone={STATUS_TONE[order.status]}>
                      {order.status}
                    </StatusBadge>
                    <span className="font-mono text-[11px] text-muted">
                      {order.createdAt.toLocaleDateString("en-AU", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  </span>
                  <span className="font-display text-[13px] font-extrabold text-ink">
                    ${formatCents(order.totalCents)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </main>
  );
}
