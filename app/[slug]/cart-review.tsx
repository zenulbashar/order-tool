"use client";

import { buttonStyles } from "@/app/_components/button-variants";
import { Stepper } from "@/app/_components/stepper";
import { formatCents } from "@/lib/validation";

import { useCart } from "./cart-provider";
import { PreCheckoutUpsell } from "./recommendations";
import type { PublicItem } from "./types";

/**
 * Cart review drawer. Line totals are recomputed live from the current menu and
 * are clearly provisional: nothing priced is ever submitted; the server
 * recomputes at order time. Stale local data is reconciled at load (see
 * cart-provider); a notice is shown here when that happened. Order type is now
 * chosen at checkout (A2); the only hint carried forward is a table-QR arrival
 * (tableLabel), which pre-selects dine-in + that table at checkout.
 */
export function CartReview({
  slug,
  tableLabel,
  onClose,
  onSelectItem,
}: {
  slug: string;
  // A table-QR arrival's table number (empty otherwise). Forwarded to checkout to
  // pre-select dine-in for that table; a normal arrival defaults to pickup there.
  tableLabel: string;
  onClose: () => void;
  // Open an item through the existing modifier sheet. Used by the upsell row.
  onSelectItem: (item: PublicItem) => void;
}) {
  const {
    displayLines,
    subtotalCents,
    count,
    setQuantity,
    removeLine,
    staleNotice,
  } = useCart();

  // Tapping an upsell closes this drawer and opens the item's modifier sheet, so
  // any required size/variant/modifier choice + pricing still happens before it
  // enters the cart — the add itself goes through the existing item flow.
  function handleUpsell(item: PublicItem) {
    onSelectItem(item);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Your order"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-card bg-surface-elevated sm:rounded-card"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-sand px-5 py-4">
          <h2 className="font-display text-lg font-semibold tracking-tight text-ink">
            Your order
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-pill text-muted hover:bg-sand hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {staleNotice ? (
            <p className="mb-3 rounded-control border border-[var(--color-warm)]/40 bg-[var(--color-warm)]/10 px-3 py-2 text-xs text-ink">
              Some items changed since your last visit and were updated.
            </p>
          ) : null}

          {count === 0 ? (
            <p className="py-8 text-center text-sm text-muted">
              Your cart is empty.
            </p>
          ) : (
            <ul className="divide-y divide-sand">
              {displayLines.map((line) => (
                <li key={line.lineId} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">
                        {line.itemName}
                        {line.variantName ? ` (${line.variantName})` : ""}
                      </p>
                      {line.options.length > 0 ? (
                        <p className="mt-0.5 text-xs text-muted">
                          {line.options.map((o) => o.name).join(", ")}
                        </p>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => removeLine(line.lineId)}
                        className="mt-1 text-xs font-medium text-error transition hover:opacity-80"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span className="text-sm text-ink">
                        ${formatCents(line.lineCents)}
                      </span>
                      {/* min/max UNSET: decrement at 1 emits onChange(0) ->
                          setLineQuantity removes the line (decrement-to-remove),
                          and the 99 cap stays provider-side. Behaviour-identical
                          to the previous inline +/−, now a 44px Stepper. */}
                      <Stepper
                        value={line.quantity}
                        onChange={(q) => setQuantity(line.lineId, q)}
                        label="Quantity"
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

        </div>

        <div className="space-y-3 border-t border-sand px-5 py-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-ink">Subtotal</span>
            <span className="font-display font-semibold text-ink">
              ${formatCents(subtotalCents)}
            </span>
          </div>
          <p className="text-xs text-muted">
            Estimated total. Prices are confirmed at checkout.
          </p>
          {count > 0 ? (
            <PreCheckoutUpsell
              checkoutHref={`/${slug}/checkout${
                tableLabel.trim()
                  ? `?type=dinein&table=${encodeURIComponent(tableLabel.trim())}`
                  : ""
              }`}
              subtotalCents={subtotalCents}
              onSelectItem={handleUpsell}
              className={buttonStyles("primary", "lg", { className: "w-full" })}
            >
              Continue to checkout · ${formatCents(subtotalCents)}
            </PreCheckoutUpsell>
          ) : null}
        </div>
      </div>
    </div>
  );
}
