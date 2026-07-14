"use client";

import { useEffect } from "react";

import { formatVenueTime } from "@/lib/time";
import { formatCents, orderReference } from "@/lib/validation";

import { OrderStatusControls } from "./order-status-controls";
import { PrintButton } from "./print-button";
import type { KitchenOrder } from "./queries";

/**
 * Focused, enlarged single-order ticket in a right-side drawer (deferred design-
 * arc). The board cards are dense; this is the "tap to read across the kitchen"
 * view — big item lines, a loud notes box, order-type + table, and the same
 * status controls + print as the card. Rendered from the immutable order
 * snapshots (like the card + paper ticket), never a live-menu join. Closes on
 * Esc or a backdrop click.
 */
export function TicketDrawer({
  order,
  timezone,
  onClose,
}: {
  order: KitchenOrder;
  timezone: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const isDineIn = order.orderType === "dine_in";

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40 print:hidden"
      role="dialog"
      aria-modal="true"
      aria-label={`Order ${orderReference(order.publicToken)}`}
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-surface shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-line bg-surface px-5 py-4">
          <div className="min-w-0">
            <p className="font-mono text-xl font-bold text-ink">
              {orderReference(order.publicToken)}
            </p>
            <p className="mt-0.5 font-mono text-xs text-muted">
              {formatVenueTime(order.createdAt, timezone)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill text-muted transition hover:bg-sand hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 px-5 py-4">
          {/* How to fulfil it — the load-bearing line, boxed and big. */}
          <div className="rounded-card border-2 border-ink px-4 py-3 text-center">
            <p className="font-display text-2xl font-extrabold uppercase tracking-wide text-ink">
              {isDineIn ? "Dine-in" : "Pickup"}
            </p>
            {isDineIn ? (
              <p className="font-display text-lg font-bold uppercase text-ink">
                Table {order.tableLabel ?? "—"}
              </p>
            ) : null}
            {order.scheduledFor ? (
              <p className="mt-1 text-sm font-semibold text-ink">
                Pickup {formatVenueTime(order.scheduledFor, timezone)}
              </p>
            ) : null}
          </div>

          <div className="mt-3 text-sm">
            <span className="font-semibold text-ink">{order.customerName}</span>
            {order.customerPhone ? (
              <a
                href={`tel:${order.customerPhone}`}
                className="ml-2 text-muted underline hover:text-ink"
              >
                {order.customerPhone}
              </a>
            ) : null}
          </div>

          {order.notes ? (
            <div className="mt-3 rounded-control border-2 border-accent/50 bg-accent/10 px-3 py-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-ink">
                Notes
              </p>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-base font-semibold text-ink">
                {order.notes}
              </p>
            </div>
          ) : null}

          {/* Items — enlarged for across-the-kitchen readability. */}
          <ul className="mt-4 divide-y divide-line border-t border-line">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-lg font-bold text-ink">
                    {item.quantity}× {item.name}
                    {item.variantName ? ` (${item.variantName})` : ""}
                  </p>
                  {item.modifiers.length > 0 ? (
                    <p className="mt-0.5 text-sm text-muted">
                      {item.modifiers.map((modifier) => modifier.name).join(", ")}
                    </p>
                  ) : null}
                </div>
                <span className="shrink-0 text-sm text-ink">
                  ${formatCents(item.lineTotalCents)}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-2 flex items-center justify-between border-t border-line pt-3">
            <span className="text-base font-semibold text-ink">Total</span>
            <span className="text-lg font-bold text-ink">
              ${formatCents(order.totalCents)}
            </span>
          </div>
        </div>

        {/* Actions — same status controls + print as the card. */}
        <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-line bg-surface px-5 py-4">
          <OrderStatusControls
            orderId={order.id}
            status={order.fulfillmentStatus}
          />
          <PrintButton order={order} />
        </div>
      </div>
    </div>
  );
}
