import { StatusBadge, type KitchenTone } from "@/app/_components/status-badge";
import { formatVenueTime } from "@/lib/time";
import { formatCents, orderReference } from "@/lib/validation";

import { OrderStatusControls } from "./order-status-controls";
import { PrintButton } from "./print-button";
import type { FulfillmentStatus, KitchenOrder } from "./queries";

// Fulfillment status → StatusBadge kitchen tone + label. "completed" maps to the
// "done" tone (muted); the others map 1:1.
const STATUS_TONE: Record<FulfillmentStatus, KitchenTone> = {
  new: "new",
  preparing: "preparing",
  ready: "ready",
  completed: "done",
};
const STATUS_LABEL: Record<FulfillmentStatus, string> = {
  new: "New",
  preparing: "Preparing",
  ready: "Ready",
  completed: "Completed",
};

/**
 * One order in the kitchen queue, rendered entirely from the immutable order
 * snapshots. Brand-new orders get an amber frame + badge so an at-a-glance scan
 * shows what just arrived.
 */
export function OrderCard({
  order,
  timezone,
  compact = false,
}: {
  order: KitchenOrder;
  timezone: string;
  /** COMPLETED column: a compact, action-less summary (ref, done, type, items, total). */
  compact?: boolean;
}) {
  const isNew = order.fulfillmentStatus === "new";

  // Compact summary for the COMPLETED column — no controls, no notes, no print:
  // just enough to recognise a finished order at a glance.
  if (compact) {
    return (
      <li className="rounded-card border border-line bg-surface-elevated p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-sm font-semibold text-ink">
            {orderReference(order.publicToken)}
          </span>
          <StatusBadge tone="done" className="shrink-0">
            {STATUS_LABEL.completed}
          </StatusBadge>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span className="rounded-sm bg-sand px-1.5 py-0.5 font-medium text-ink">
            {order.orderType === "dine_in"
              ? `Dine-in · Table ${order.tableLabel ?? "—"}`
              : "Pickup"}
          </span>
          <span className="min-w-0 truncate">
            {order.items
              .map((item) => `${item.quantity}× ${item.name}`)
              .join(", ")}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
          <span className="text-xs font-medium text-muted">Total</span>
          <span className="text-sm font-semibold text-ink">
            ${formatCents(order.totalCents)}
          </span>
        </div>
      </li>
    );
  }

  return (
    <li
      className={`rounded-card border p-4 ${
        isNew
          ? "border-accent bg-accent/10 ring-1 ring-accent/20"
          : "border-line bg-surface-elevated"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold text-ink">
              {orderReference(order.publicToken)}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {formatVenueTime(order.createdAt, timezone)}
          </p>
          {order.scheduledFor ? (
            <p className="mt-0.5 text-xs font-semibold text-ink">
              Scheduled pickup · {formatVenueTime(order.scheduledFor, timezone)}
            </p>
          ) : null}
        </div>
        <StatusBadge
          tone={STATUS_TONE[order.fulfillmentStatus]}
          className="shrink-0"
        >
          {STATUS_LABEL[order.fulfillmentStatus]}
        </StatusBadge>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="rounded-sm bg-sand px-2 py-0.5 text-xs font-medium text-ink">
          {order.orderType === "dine_in"
            ? `Dine-in · Table ${order.tableLabel ?? "—"}`
            : "Pickup"}
        </span>
        <span className="font-medium text-ink">{order.customerName}</span>
        {order.customerPhone ? (
          <a
            href={`tel:${order.customerPhone}`}
            className="text-muted underline hover:text-ink"
          >
            {order.customerPhone}
          </a>
        ) : null}
      </div>

      {/* Customer special request — rendered as plain (React-escaped) text so it
          can never inject markup, and visually loud so the kitchen sees it. */}
      {order.notes ? (
        <div className="mt-3 rounded-control border border-accent/40 bg-accent/10 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink">
            Notes
          </p>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-ink">
            {order.notes}
          </p>
        </div>
      ) : null}

      <ul className="mt-3 divide-y divide-line border-t border-line">
        {order.items.map((item) => (
          <li
            key={item.id}
            className="flex items-start justify-between gap-3 py-2"
          >
            <div className="min-w-0">
              <p className="text-sm text-ink">
                <span className="text-muted">{item.quantity}×</span>{" "}
                {item.name}
                {item.variantName ? ` (${item.variantName})` : ""}
              </p>
              {item.modifiers.length > 0 ? (
                <p className="mt-0.5 text-xs text-muted">
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

      <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
        <span className="text-sm font-medium text-ink">Total</span>
        <span className="text-base font-semibold text-ink">
          ${formatCents(order.totalCents)}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <OrderStatusControls orderId={order.id} status={order.fulfillmentStatus} />
        <PrintButton order={order} />
      </div>
    </li>
  );
}
