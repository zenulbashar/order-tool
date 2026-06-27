"use client";

import { useState } from "react";

import { formatCents } from "@/lib/validation";

import { useCart } from "./cart-provider";
import { CartReview } from "./cart-review";
import type { OrderType, PublicItem } from "./types";

/**
 * Persistent cart bar. Hidden when the cart is empty; otherwise sticks to the
 * bottom and opens the review drawer. The storefront reserves bottom padding so
 * the bar never covers the last item. orderType/tableLabel are passed through
 * to the review so "Continue to checkout" can carry the selection forward.
 */
export function CartBar({
  slug,
  orderType,
  tableLabel,
  onSelectItem,
}: {
  slug: string;
  orderType: OrderType;
  tableLabel: string;
  // Open an item through the existing modifier sheet — passed to the cart-review
  // upsell so a recommended add still goes through required selections + pricing.
  onSelectItem: (item: PublicItem) => void;
}) {
  const { count, subtotalCents } = useCart();
  const [open, setOpen] = useState(false);

  if (count === 0) return null;

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-2xl px-5 pb-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-between rounded-full px-5 py-3 text-sm font-semibold text-white shadow-lg"
          style={{ backgroundColor: "var(--brand)" }}
        >
          <span>
            View cart · {count} {count === 1 ? "item" : "items"}
          </span>
          <span>${formatCents(subtotalCents)}</span>
        </button>
      </div>
      {open ? (
        <CartReview
          slug={slug}
          orderType={orderType}
          tableLabel={tableLabel}
          onClose={() => setOpen(false)}
          onSelectItem={onSelectItem}
        />
      ) : null}
    </>
  );
}
