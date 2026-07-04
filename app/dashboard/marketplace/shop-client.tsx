"use client";

import { useMemo, useState, useTransition } from "react";

import { Button } from "@/app/_components/button";
import { cx } from "@/app/_components/cx";
import { formatCents } from "@/lib/validation";

import { placeMarketplaceOrder } from "./actions";

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
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
    setDone(false);
    setError(null);
    setCart((prev) => {
      const next = new Map(prev);
      if (qty <= 0) next.delete(id);
      else next.set(id, qty);
      return next;
    });
  }

  function submit() {
    if (lines.length === 0) return;
    setError(null);
    startTransition(async () => {
      const result = await placeMarketplaceOrder({
        note,
        items: lines.map(([productId, quantity]) => ({ productId, quantity })),
      });
      if (result.ok) {
        setCart(new Map());
        setNote("");
        setDone(true);
      } else {
        setError(result.error);
      }
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
        {done ? (
          <div className="rounded-card border border-[var(--color-success)]/30 bg-[var(--color-success)]/8 px-4 py-3 text-sm text-success-deep">
            Order requested — we&apos;ll confirm it and send an invoice. Track it
            under &ldquo;Your orders&rdquo; below.
          </div>
        ) : null}

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

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
                  <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-label">
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
                      <span className="ml-1 font-mono text-[10px] font-normal text-muted">
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

      {/* Cart */}
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <div className="rounded-card border border-line bg-surface-elevated p-4 shadow-card">
          <div className="flex items-center justify-between">
            <p className="font-display text-base font-semibold tracking-tight text-ink">
              Your cart
            </p>
            {itemCount > 0 ? (
              <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-label">
                {itemCount} {itemCount === 1 ? "item" : "items"}
              </span>
            ) : null}
          </div>
          {lines.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              Add items to build an order. You&apos;ll be invoiced — nothing is
              charged now.
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
                        <span className="block truncate font-mono text-[10px] text-muted">
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
                  <span className="text-muted">Est. shipping</span>
                  <span className="text-muted">Quoted on invoice</span>
                </div>
              </div>
              <textarea
                rows={2}
                value={note}
                maxLength={500}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Delivery notes (optional)"
                className="mt-3 w-full resize-none rounded-input border border-line bg-surface-elevated px-2.5 py-2 text-sm text-ink shadow-sm focus-visible:border-[var(--color-accent)] focus-visible:shadow-[var(--focus-ring-input)] focus-visible:outline-none"
              />
              <p className="mt-3 rounded-control bg-hover-secondary px-3 py-2 text-[11px] text-muted">
                <span className="font-bold text-ink">Invoice later.</span> No card
                charged now — added to your monthly Prompt2Eat invoice.
              </p>
              {error ? (
                <p className="mt-2 text-sm text-warm-deep" role="alert">
                  {error}
                </p>
              ) : null}
              <Button
                type="button"
                variant="primary"
                onClick={submit}
                loading={pending}
                loadingLabel="Sending…"
                className="mt-3 w-full"
              >
                Request order →
              </Button>
            </>
          )}
        </div>
      </aside>
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
      <button
        type="button"
        onClick={() => onChange(1)}
        className="rounded-input bg-[var(--color-accent)] px-3 py-1.5 text-xs font-bold text-forest transition hover:opacity-90"
      >
        ＋ Add
      </button>
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
