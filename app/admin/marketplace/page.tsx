import type { Metadata } from "next";
import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";

import { StatusBadge } from "@/app/_components/status-badge";
import { db } from "@/lib/db";
import {
  marketplaceOrderItems,
  marketplaceOrders,
  marketplaceProducts,
  venues,
} from "@/lib/db/schema";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { formatCents } from "@/lib/validation";

import { advanceMarketplaceOrder } from "./actions";
import { ProductForm } from "./product-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Marketplace admin" };

const eyebrow = "font-mono text-[9px] font-bold uppercase tracking-wider text-label";

const STATUS_TONE = {
  requested: "processing",
  confirmed: "ready",
  shipped: "paid",
  cancelled: "cancelled",
} as const;

const NEXT_STATUS: Record<string, { value: string; label: string }[]> = {
  requested: [
    { value: "confirmed", label: "Confirm" },
    { value: "cancelled", label: "Cancel" },
  ],
  confirmed: [{ value: "shipped", label: "Mark shipped" }],
  shipped: [],
  cancelled: [],
};

/**
 * Hardware marketplace — admin curation + fulfilment (Track F). Operator-gated
 * (requirePlatformAdmin). Manage the global catalog and advance venue orders.
 */
export default async function AdminMarketplacePage() {
  await requirePlatformAdmin();

  const [products, orders] = await Promise.all([
    db
      .select()
      .from(marketplaceProducts)
      .orderBy(asc(marketplaceProducts.category), asc(marketplaceProducts.name)),
    db
      .select({
        id: marketplaceOrders.id,
        venueName: venues.name,
        status: marketplaceOrders.status,
        totalCents: marketplaceOrders.totalCents,
        note: marketplaceOrders.note,
        createdAt: marketplaceOrders.createdAt,
      })
      .from(marketplaceOrders)
      .innerJoin(venues, eq(venues.id, marketplaceOrders.venueId))
      .orderBy(desc(marketplaceOrders.createdAt))
      .limit(50),
  ]);

  const items = orders.length
    ? await db
        .select({
          orderId: marketplaceOrderItems.orderId,
          nameSnapshot: marketplaceOrderItems.nameSnapshot,
          quantity: marketplaceOrderItems.quantity,
        })
        .from(marketplaceOrderItems)
    : [];
  const itemsByOrder = new Map<string, typeof items>();
  for (const item of items) {
    const list = itemsByOrder.get(item.orderId) ?? [];
    list.push(item);
    itemsByOrder.set(item.orderId, list);
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <header className="mb-6">
        <Link href="/admin" className="text-xs font-medium text-[var(--action)] hover:opacity-80">
          ← Admin
        </Link>
        <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-ink">
          Marketplace
        </h1>
        <p className="mt-1 text-sm text-muted">
          {products.length} product{products.length === 1 ? "" : "s"} ·{" "}
          {orders.filter((o) => o.status === "requested").length} awaiting
          confirmation
        </p>
      </header>

      {/* Orders */}
      <section className="mb-8">
        <p className={`${eyebrow} mb-2`}>Orders</p>
        {orders.length === 0 ? (
          <div className="rounded-card border border-dashed border-line p-6 text-center text-sm text-muted">
            No hardware orders yet.
          </div>
        ) : (
          <div className="space-y-2">
            {orders.map((order) => (
              <div
                key={order.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface-elevated px-4 py-3 shadow-sm"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-ink">{order.venueName}</span>
                    <StatusBadge tone={STATUS_TONE[order.status]}>{order.status}</StatusBadge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {(itemsByOrder.get(order.id) ?? [])
                      .map((i) => `${i.quantity}× ${i.nameSnapshot}`)
                      .join(", ")}
                    {order.note ? ` · “${order.note}”` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-display text-sm font-extrabold text-ink">
                    ${formatCents(order.totalCents)}
                  </span>
                  {(NEXT_STATUS[order.status] ?? []).map((next) => (
                    <form key={next.value} action={advanceMarketplaceOrder}>
                      <input type="hidden" name="id" value={order.id} />
                      <input type="hidden" name="status" value={next.value} />
                      <button
                        type="submit"
                        className="rounded-control border border-line-strong px-2.5 py-1 text-xs font-bold text-ink transition hover:bg-hover-secondary"
                      >
                        {next.label}
                      </button>
                    </form>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Catalog */}
      <section>
        <p className={`${eyebrow} mb-2`}>Catalog</p>
        <div className="mb-3">
          <ProductForm />
        </div>
        {products.length === 0 ? (
          <p className="text-sm text-muted">No products yet — add the first above.</p>
        ) : (
          <div className="overflow-hidden rounded-card border border-line bg-surface-elevated shadow-card">
            <ul>
              {products.map((product) => (
                <li
                  key={product.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 px-4 py-3 last:border-0"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-bold text-ink">{product.name}</span>
                    <span className="rounded-[5px] bg-sand px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider text-muted">
                      {product.category}
                    </span>
                    {!product.isActive ? (
                      <span className="rounded-[5px] bg-[var(--color-warm)]/15 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider text-warm-deep">
                        Hidden
                      </span>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="font-display text-sm font-extrabold text-ink">
                      ${formatCents(product.priceCents)}
                    </span>
                    <ProductForm product={product} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}
