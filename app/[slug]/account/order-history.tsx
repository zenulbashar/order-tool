"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { ButtonLabel } from "@/app/_components/spinner";
import { formatCents, orderReference } from "@/lib/validation";

import { seedStoredCart } from "../cart-provider";
import { reorder, signOutCustomer } from "./actions";
import type { CustomerOrderSummary, RecentCustomerOrder } from "./types";

const STATUS_LABEL: Record<CustomerOrderSummary["status"], string> = {
  confirmed: "Paid",
  pending_payment: "Processing",
  payment_failed: "Not completed",
  cancelled: "Cancelled",
};

const STATUS_CLASS: Record<CustomerOrderSummary["status"], string> = {
  confirmed: "bg-green-100 text-green-800",
  pending_payment: "bg-amber-100 text-amber-800",
  payment_failed: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-700",
};

/**
 * A customer's order history with 1-click reorder. Reorder seeds the cart with
 * the past order's ids only (via seedStoredCart) — never prices — then navigates
 * to the storefront, where the cart's existing reconciliation drops/updates any
 * unavailable items (surfaced as the "items changed" notice) and checkout
 * re-prices live. So a reorder is just a normal new order with a pre-filled cart.
 */
export function OrderHistory({
  slug,
  customerEmail,
  recentOrders,
  orders,
}: {
  slug: string;
  customerEmail: string;
  recentOrders: RecentCustomerOrder[];
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
        <p className="min-w-0 truncate text-gray-500">
          Signed in as{" "}
          <span className="font-medium text-gray-900">{customerEmail}</span>
        </p>
        <form action={signOutCustomer}>
          <button
            type="submit"
            className="shrink-0 text-xs font-medium text-gray-500 underline hover:text-gray-900"
          >
            Sign out
          </button>
        </form>
      </div>

      {error ? (
        <p className="mx-5 mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {/* Favourites — the last few orders as prominent one-tap reorder cards,
          rendered from the immutable snapshots (add-ons + notes). Reorder reuses
          the SAME handleReorder as the list below (ids-only, re-prices live). */}
      {recentOrders.length > 0 ? (
        <section className="px-5 pb-1 pt-2">
          <h2 className="text-sm font-semibold text-gray-900">Quick reorder</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Your most recent orders — reorder in one tap.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {recentOrders.map((order) => {
              const reordering = pendingToken === order.publicToken;
              return (
                <div
                  key={order.publicToken}
                  className="flex flex-col rounded-xl border border-gray-200 p-4"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-gray-500">
                      {orderReference(order.publicToken)}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CLASS[order.status]}`}
                    >
                      {STATUS_LABEL[order.status]}
                    </span>
                  </div>

                  <ul className="mt-2 space-y-1">
                    {order.items.map((item, index) => (
                      <li
                        key={`${index}-${item.name}`}
                        className="text-sm text-gray-900"
                      >
                        <span className="text-gray-500">{item.quantity}×</span>{" "}
                        {item.name}
                        {item.variantName ? ` (${item.variantName})` : ""}
                        {item.modifierNames.length > 0 ? (
                          <span className="text-gray-500">
                            {" "}
                            — {item.modifierNames.join(", ")}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>

                  {order.notes ? (
                    <p className="mt-2 whitespace-pre-wrap break-words rounded-md bg-gray-50 px-2 py-1 text-xs text-gray-600">
                      <span className="font-medium text-gray-500">Notes: </span>
                      {order.notes}
                    </p>
                  ) : null}

                  <p className="mt-2 text-xs text-gray-400">
                    <span suppressHydrationWarning>
                      {new Date(order.createdAt).toLocaleDateString("en-AU", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>{" "}
                    · {order.orderType === "dine_in" ? "Dine-in" : "Pickup"} · $
                    {formatCents(order.totalCents)}
                  </p>

                  <button
                    type="button"
                    onClick={() => handleReorder(order.publicToken)}
                    disabled={isPending}
                    className="mt-3 w-full rounded-lg px-3 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ backgroundColor: "var(--brand)" }}
                  >
                    <ButtonLabel pending={reordering} pendingLabel="Adding…">
                      Reorder
                    </ButtonLabel>
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {orders.length === 0 ? (
        <section className="px-5 py-10">
          <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
            No orders yet. Once you place an order it&apos;ll show up here for easy
            reordering.
          </p>
        </section>
      ) : (
        <ul className="divide-y divide-gray-100 px-5 pb-10">
          {orders.map((order) => {
            const reordering = pendingToken === order.publicToken;
            return (
              <li key={order.publicToken} className="py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-gray-500">
                        {orderReference(order.publicToken)}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CLASS[order.status]}`}
                      >
                        {STATUS_LABEL[order.status]}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-900">
                      {order.itemSummary || "—"}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      <span suppressHydrationWarning>
                        {new Date(order.createdAt).toLocaleDateString("en-AU", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>{" "}
                      · {order.orderType === "dine_in" ? "Dine-in" : "Pickup"} · $
                      {formatCents(order.totalCents)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleReorder(order.publicToken)}
                    disabled={isPending}
                    className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-900 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ButtonLabel pending={reordering} pendingLabel="Adding…">
                      Reorder
                    </ButtonLabel>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
