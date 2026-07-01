"use client";

import { formatCents } from "@/lib/validation";

import { useCart } from "./cart-provider";

/**
 * Persistent cart bar. Hidden when the cart is empty; otherwise sticks to the
 * bottom and opens the review drawer. The storefront reserves bottom padding so
 * the bar never covers the last item. The review drawer's open-state lives in
 * StorefrontInner (so the concierge panel can open it too); this bar just asks
 * to open it via onOpen.
 */
export function CartBar({ onOpen }: { onOpen: () => void }) {
  const { count, subtotalCents } = useCart();

  if (count === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-3xl px-5 pb-4">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center justify-between rounded-pill px-5 py-3 text-sm font-semibold text-[var(--action-contrast)] shadow-lg"
        style={{ backgroundColor: "var(--action)" }}
      >
        <span>
          View cart · {count} {count === 1 ? "item" : "items"}
        </span>
        <span className="font-display">${formatCents(subtotalCents)}</span>
      </button>
    </div>
  );
}
