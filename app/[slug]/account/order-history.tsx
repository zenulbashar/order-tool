"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/app/_components/button";
import { StatusBadge, type PaymentTone } from "@/app/_components/status-badge";
import { formatCents, orderReference } from "@/lib/validation";

import { seedStoredCart } from "../cart-provider";
import { reorder, signOutCustomer } from "./actions";
import type { CustomerOrderSummary, CustomerUsual } from "./types";

const STATUS_LABEL: Record<CustomerOrderSummary["status"], string> = {
  confirmed: "Paid",
  pending_payment: "Processing",
  payment_failed: "Not completed",
  cancelled: "Cancelled",
};

// Payment/order state → StatusBadge semantic tone (success/accent/warm/muted).
const STATUS_TONE: Record<CustomerOrderSummary["status"], PaymentTone> = {
  confirmed: "paid",
  pending_payment: "processing",
  payment_failed: "failed",
  cancelled: "cancelled",
};

/**
 * A customer's order history with 1-click reorder. Reorder seeds the cart with
 * the past order's ids only (via seedStoredCart) — never prices — then navigates
 * to the storefront, where the cart's existing reconciliation drops/updates any
 * unavailable items (surfaced as the "items changed" notice) and checkout
 * re-prices live. So a reorder is just a normal new order with a pre-filled cart.
 * The "YOUR USUAL" hero reorders through the SAME path — its publicToken is the
 * newest order matching the customer's most-repeated fingerprint.
 */
export function OrderHistory({
  slug,
  customerEmail,
  usual,
  orders,
}: {
  slug: string;
  customerEmail: string;
  usual: CustomerUsual | null;
  orders: CustomerOrderSummary[];
}) {
  const router = useRouter();
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleReorder(token: string) {
    if (isPending) return;
    setError(null);
    setPendingToken(token);
    startTransition(async () => {
      const result = await reorder(slug, token);
      if (!result.ok) {
        setError(result.error);
        setPendingToken(null);
        return;
      }
      if (result.lines.length === 0) {
        setError("None of those items are available to reorder right now.");
        setPendingToken(null);
        return;
      }
      // Seed the cart, then go to the storefront. A fresh CartProvider hydrates
      // from sessionStorage and reconciles against the live menu — the same path
      // a returning customer's saved cart already takes.
      seedStoredCart(slug, result.lines);
      router.push(`/${slug}`);
    });
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
        <p className="min-w-0 truncate text-muted">
          Signed in as{" "}
          <span className="font-medium text-ink">{customerEmail}</span>
        </p>
        <form action={signOutCustomer}>
          <button
            type="submit"
            className="shrink-0 text-xs font-medium text-muted underline hover:text-ink"
          >
            Sign out
          </button>
        </form>
      </div>

      {error ? (
        <p
          className="mx-5 mb-2 rounded-control bg-[var(--color-warm)]/10 px-3 py-2 text-sm text-[var(--color-warm-deep)]"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {/* YOUR USUAL — the customer's most-repeated identical order as a
          forest-dark hero (the concierge dark-surface idiom: forest tokens,
          amber-on-dark accents). Reorder reuses the SAME handleReorder as the
          list below (ids-only, re-prices live). */}
      {usual ? (
        <section className="px-5 pb-1 pt-2">
          <div className="relative overflow-hidden rounded-card bg-[linear-gradient(135deg,var(--color-forest-deep),var(--color-concierge-glow))] p-4 shadow-card">
            <div
              aria-hidden
              className="p2e-glow absolute -right-6 -top-9 h-28 w-28 bg-[radial-gradient(circle,color-mix(in_srgb,var(--color-accent)_30%,transparent),transparent_65%)]"
            />
            <p className="relative font-mono text-[10px] font-bold uppercase tracking-wider text-accent">
              Your usual
            </p>
            <p className="relative mt-1.5 text-[15px] font-bold text-white">
              {usual.title}
            </p>
            <div className="relative mt-3 flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-concierge-sage">
                Ordered {usual.count} times
              </span>
              <button
                type="button"
                onClick={() => handleReorder(usual.publicToken)}
                disabled={isPending}
                className="shrink-0 rounded-control bg-accent px-3.5 py-2 text-xs font-bold text-forest transition hover:opacity-90 disabled:opacity-60"
              >
                {pendingToken === usual.publicToken
                  ? "Adding…"
                  : `↻ Reorder · $${formatCents(usual.totalCents)}`}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {orders.length === 0 ? (
        <section className="px-5 py-10">
          <p className="rounded-card border border-dashed border-line p-8 text-center text-sm text-muted">
            No orders yet. Once you place an order it&apos;ll show up here for easy
            reordering.
          </p>
        </section>
      ) : (
        <section className="px-5 pb-10 pt-3">
          <h2 className="font-mono text-[9px] font-bold uppercase tracking-wider text-label">
            Earlier
          </h2>
          <ul className="mt-2 space-y-2.5">
            {orders.map((order) => {
              const reordering = pendingToken === order.publicToken;
              return (
                <li
                  key={order.publicToken}
                  className="rounded-card border border-line bg-surface-elevated p-4 shadow-card"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-muted">
                      {orderReference(order.publicToken)}
                    </span>
                    <StatusBadge tone={STATUS_TONE[order.status]}>
                      {STATUS_LABEL[order.status]}
                    </StatusBadge>
                  </div>
                  <p className="mt-1.5 text-sm text-ink">
                    {order.itemSummary || "—"}
                  </p>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="font-mono text-[11px] font-bold uppercase text-label">
                      <span suppressHydrationWarning>
                        {new Date(order.createdAt).toLocaleDateString("en-AU", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>{" "}
                      · ${formatCents(order.totalCents)}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleReorder(order.publicToken)}
                      disabled={isPending}
                      loading={reordering}
                      loadingLabel="Adding…"
                      className="shrink-0"
                    >
                      ↻ Reorder
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
