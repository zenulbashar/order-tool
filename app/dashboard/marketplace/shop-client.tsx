"use client";

import { useMemo, useState, useTransition } from "react";
import { controlClass } from "@/app/_components/field";

import { Button } from "@/app/_components/button";
import { cx } from "@/app/_components/cx";
import { formatCents } from "@/lib/validation";

import { checkoutMarketplaceOrder } from "./actions";
import { useStickyMetric } from "@/app/_components/use-sticky-metrics";

export type ShopProduct = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  priceCents: number;
  unitLabel: string | null;
  supplier: string | null;
  imageUrl: string | null;
};

const CATEGORY_LABEL: Record<string, string> = {
  signage: "Signage",
  tablet: "Tablets",
  stand: "Stands",
  consumable: "Consumables",
  banner: "Banners",
  other: "Other",
};

export function ShopClient({ products }: { products: ShopProduct[] }) {
  const [cart, setCart] = useState<Map<string, number>>(new Map());
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [cartOpen, setCartOpen] = useState(false);
  /*
    Measured and published on <html>, not declared on this section (R2-1). The
    support FAB reading it is a SIBLING of <main>, so a value set here would
    never inherit to it. Measuring also removes the need for a desktop reset —
    the bar is lg:hidden, so it measures 0 — and the hook clears the property
    when the bar unmounts, which is most of the time (it renders only with items
    in the cart).
  */
  const barRef = useStickyMetric<HTMLButtonElement>("--p2e-bottom-bar-h");

  const byId = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );

  const lines = [...cart.entries()].filter(([, qty]) => qty > 0);
  const total = lines.reduce(
    (sum, [id, qty]) => sum + (byId.get(id)?.priceCents ?? 0) * qty,
    0,
  );

  function setQty(id: string, qty: number) {
    setCart((prev) => {
      const next = new Map(prev);
      if (qty <= 0) next.delete(id);
      else next.set(id, qty);
      return next;
    });
  }

  function submit() {
    if (lines.length === 0) return;
    // The action redirects to Stripe Checkout on success (or back with
    // ?error=checkout), so there's nothing to handle here — the page shows the
    // success/error banner on return.
    startTransition(async () => {
      await checkoutMarketplaceOrder({
        note,
        items: lines.map(([productId, quantity]) => ({ productId, quantity })),
      });
    });
  }

  // Category filter pills (design): "All" + the categories actually stocked.
  const categories = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const p of products) {
      if (!seen.has(p.category)) {
        seen.add(p.category);
        list.push(p.category);
      }
    }
    return list;
  }, [products]);
  const [cat, setCat] = useState<string>("all");
  const visible = cat === "all" ? products : products.filter((p) => p.category === cat);
  const itemCount = lines.reduce((sum, [, qty]) => sum + qty, 0);

  return (
    <section className="grid gap-6 px-5 py-8 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        {/* Category pills */}
        <div className="flex flex-wrap gap-2">
          {[{ id: "all", label: "All" }, ...categories.map((c) => ({ id: c, label: CATEGORY_LABEL[c] ?? c }))].map(
            (c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCat(c.id)}
                className={cx(
                  "rounded-pill px-3.5 py-1.5 text-xs font-bold transition",
                  cat === c.id
                    ? "bg-[var(--color-accent)] text-forest"
                    : "border border-line-strong text-ink hover:bg-hover-secondary",
                )}
              >
                {c.label}
              </button>
            ),
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
          {visible.map((product) => (
            <div
              key={product.id}
              className="flex flex-col overflow-hidden rounded-card border border-line bg-surface-elevated shadow-card"
            >
              {product.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className="h-32 w-full object-cover"
                />
              ) : (
                <div className="flex h-32 w-full items-center justify-center bg-[repeating-linear-gradient(135deg,#efe6d2_0_11px,#f6efe1_11px_22px)]">
                  <span className="font-mono text-2xs font-bold uppercase tracking-wider text-label">
                    {CATEGORY_LABEL[product.category] ?? product.category}
                  </span>
                </div>
              )}
              <div className="flex flex-1 flex-col p-3">
                <p className="text-sm font-bold text-ink">{product.name}</p>
                {product.description ? (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted">
                    {product.description}
                  </p>
                ) : null}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="font-display text-base font-extrabold text-ink">
                    ${formatCents(product.priceCents)}
                    {product.unitLabel ? (
                      <span className="ml-1 font-mono text-micro font-normal text-muted">
                        {product.unitLabel}
                      </span>
                    ) : null}
                  </span>
                  <QtyStepper
                    value={cart.get(product.id) ?? 0}
                    onChange={(q) => setQty(product.id, q)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cart — desktop sidebar (mobile uses the bottom bar + overlay below). */}
      <aside className="hidden lg:sticky lg:top-6 lg:block lg:self-start">
        <div className="rounded-card border border-line bg-surface-elevated p-4 shadow-card">
          <div className="flex items-center justify-between">
            <p className="font-display text-base font-semibold tracking-tight text-ink">
              Your cart
            </p>
            {itemCount > 0 ? (
              <span className="font-mono text-2xs font-bold uppercase tracking-wider text-label">
                {itemCount} {itemCount === 1 ? "item" : "items"}
              </span>
            ) : null}
          </div>
          {lines.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              Add items to build an order — you&apos;ll pay securely by card at
              checkout.
            </p>
          ) : (
            <>
              <ul className="mt-3 space-y-2.5">
                {lines.map(([id, qty]) => {
                  const p = byId.get(id);
                  if (!p) return null;
                  return (
                    <li key={id} className="flex items-center gap-2.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-input bg-[repeating-linear-gradient(135deg,#efe6d2_0_7px,#f6efe1_7px_14px)]" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">
                          {p.name}
                        </span>
                        <span className="block truncate font-mono text-micro text-muted">
                          {p.unitLabel ?? "each"} · ×{qty}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-bold text-ink">
                        ${formatCents(p.priceCents * qty)}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-3 space-y-1.5 border-t border-line pt-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted">Subtotal</span>
                  <span className="font-display font-extrabold text-ink">
                    ${formatCents(total)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted">Shipping</span>
                  <span className="text-muted">Billed separately</span>
                </div>
              </div>
              <textarea
                rows={2}
                value={note}
                maxLength={500}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Delivery notes (optional)"
                className={controlClass({ padding: "px-2.5 py-2", width: "w-full", className: "mt-3 resize-none" })}
              />
              <p className="mt-3 rounded-control bg-hover-secondary px-3 py-2 text-eyebrow text-muted">
                <span className="font-bold text-ink">Secure checkout.</span>{" "}
                You&apos;ll pay by card on the next screen (Stripe). Shipping, if
                any, is billed separately.
              </p>
              <Button
                type="button"
                variant="primary"
                onClick={submit}
                loading={pending}
                loadingLabel="Opening checkout…"
                className="mt-3 w-full"
              >
                Checkout · ${formatCents(total)} →
              </Button>
            </>
          )}
        </div>
      </aside>

      {/* Mobile: a sticky "view cart" bar that opens a full-screen cart. */}
      {itemCount > 0 && !cartOpen ? (
        <button
          type="button"
          ref={barRef}
          onClick={() => setCartOpen(true)}
          className="fixed inset-x-0 bottom-0 z-chrome flex items-center justify-between gap-3 border-t border-line bg-surface-elevated px-5 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 shadow-[0_-4px_16px_rgba(20,30,25,0.08)] lg:hidden"
        >
          <span className="flex items-center gap-2 text-sm font-bold text-ink">
            <span className="flex h-6 min-w-[24px] items-center justify-center rounded-full bg-[var(--color-accent)] px-1.5 text-eyebrow font-bold text-forest">
              {itemCount}
            </span>
            View cart
          </span>
          <span className="font-display text-base font-extrabold text-ink">
            ${formatCents(total)}
          </span>
        </button>
      ) : null}

      {/* Mobile: full-screen dark cart (P2E-Shop shop-mobile-cart). */}
      {cartOpen ? (
        <div className="fixed inset-0 z-modal flex flex-col bg-forest-deep text-white lg:hidden">
          <div className="flex items-center justify-between px-5 pb-3 pt-[calc(env(safe-area-inset-top)+14px)]">
            <button
              type="button"
              onClick={() => setCartOpen(false)}
              className="flex items-center gap-1 text-sm font-bold text-white"
            >
              <span aria-hidden="true">‹</span> Your cart
            </button>
            <span className="font-mono text-2xs font-bold uppercase tracking-wider text-[var(--color-sidebar-muted)]">
              {itemCount} {itemCount === 1 ? "item" : "items"}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto px-5">
            {lines.length === 0 ? (
              <p className="mt-10 text-center text-sm text-[var(--color-sidebar-ink)]">
                Your cart is empty.
              </p>
            ) : (
              <>
                <ul className="space-y-3">
                  {lines.map(([id, qty]) => {
                    const p = byId.get(id);
                    if (!p) return null;
                    return (
                      <li key={id} className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 rounded-input bg-white/5" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-white">
                            {p.name}
                          </span>
                          <span className="block truncate font-mono text-micro text-[var(--color-sidebar-muted)]">
                            {p.unitLabel ?? "each"} · ×{qty}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm font-bold text-white">
                          ${formatCents(p.priceCents * qty)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <textarea
                  rows={2}
                  value={note}
                  maxLength={500}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Delivery notes (optional)"
                  className="mt-4 w-full resize-none rounded-input border border-white/15 bg-white/5 px-2.5 py-2 text-base sm:text-sm text-white placeholder:text-[var(--color-sidebar-muted)] focus-visible:border-[var(--color-accent)] focus-visible:outline-none"
                />
                <p className="mt-3 rounded-control bg-white/5 px-3 py-2 text-eyebrow text-[var(--color-sidebar-muted)]">
                  <span className="font-bold text-white">Secure checkout.</span>{" "}
                  You&apos;ll pay by card on the next screen. Shipping, if any, is
                  billed separately.
                </p>
              </>
            )}
          </div>

          {lines.length > 0 ? (
            <div className="border-t border-white/10 px-5 pb-[calc(env(safe-area-inset-bottom)+14px)] pt-3">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm text-[var(--color-sidebar-ink)]">Total</span>
                <span className="font-display text-lg font-extrabold text-white">
                  ${formatCents(total)}
                </span>
              </div>
              <Button
                variant="primary"
                size="lg"
                className="w-full"
                onClick={submit}
                loading={pending}
                loadingLabel="Opening checkout…"
              >
                {`Checkout · $${formatCents(total)} →`}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function QtyStepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  if (value === 0) {
    return (
      <Button variant="primary" size="sm" onClick={() => onChange(1)}>
        ＋ Add
      </Button>
    );
  }
  const btn =
    "flex h-7 w-7 items-center justify-center rounded-input border border-line text-sm font-bold text-ink transition hover:bg-hover-secondary";
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => onChange(value - 1)} className={btn} aria-label="Decrease">
        −
      </button>
      <span className={cx("w-6 text-center text-sm font-bold text-ink")}>{value}</span>
      <button type="button" onClick={() => onChange(value + 1)} className={btn} aria-label="Increase">
        +
      </button>
    </div>
  );
}
