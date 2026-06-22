"use client";

import Link from "next/link";

import { formatCents } from "@/lib/validation";

import { useCart } from "./cart-provider";
import type { OrderType } from "./types";

/**
 * Cart review drawer. Line totals are recomputed live from the current menu and
 * are clearly provisional — nothing priced is ever submitted; the server
 * recomputes at order time. Stale local data is reconciled at load (see
 * cart-provider); a notice is shown here when that happened. The order-type
 * selection is carried to checkout via query params.
 */
export function CartReview({
  slug,
  orderType,
  tableLabel,
  onClose,
}: {
  slug: string;
  orderType: OrderType;
  tableLabel: string;
  onClose: () => void;
}) {
  const {
    displayLines,
    subtotalCents,
    count,
    setQuantity,
    removeLine,
    staleNotice,
  } = useCart();

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Your order"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-2xl bg-white sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-lg font-semibold tracking-tight text-gray-900">
            Your order
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {staleNotice ? (
            <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Some items changed since your last visit and were updated.
            </p>
          ) : null}

          {count === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              Your cart is empty.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {displayLines.map((line) => (
                <li key={line.lineId} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {line.itemName}
                      </p>
                      {line.options.length > 0 ? (
                        <p className="mt-0.5 text-xs text-gray-500">
                          {line.options.map((o) => o.name).join(", ")}
                        </p>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => removeLine(line.lineId)}
                        className="mt-1 text-xs font-medium text-red-600 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span className="text-sm text-gray-700">
                        ${formatCents(line.lineCents)}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setQuantity(line.lineId, line.quantity - 1)
                          }
                          aria-label="Decrease quantity"
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-300 text-gray-700"
                        >
                          −
                        </button>
                        <span className="w-5 text-center text-sm font-medium">
                          {line.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setQuantity(line.lineId, line.quantity + 1)
                          }
                          aria-label="Increase quantity"
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-300 text-gray-700"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-3 border-t border-gray-100 px-5 py-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-gray-900">Subtotal</span>
            <span className="font-semibold text-gray-900">
              ${formatCents(subtotalCents)}
            </span>
          </div>
          <p className="text-xs text-gray-400">
            Estimated total. Prices are confirmed at checkout.
          </p>
          {count > 0 ? (
            <Link
              href={`/${slug}/checkout?type=${orderType}${
                orderType === "dinein" && tableLabel.trim()
                  ? `&table=${encodeURIComponent(tableLabel.trim())}`
                  : ""
              }`}
              className="block w-full rounded-lg px-4 py-3 text-center text-sm font-semibold text-white"
              style={{ backgroundColor: "var(--brand)" }}
            >
              Continue to checkout
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
