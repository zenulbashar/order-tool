import { formatVenueTime } from "@/lib/time";
import { formatCents, orderReference } from "@/lib/validation";

import { OrderStatusControls } from "./order-status-controls";
import type { FulfillmentStatus, KitchenOrder } from "./queries";

const STATUS_BADGE: Record<
  FulfillmentStatus,
  { label: string; className: string }
> = {
  new: { label: "New", className: "bg-amber-100 text-amber-800" },
  preparing: { label: "Preparing", className: "bg-blue-100 text-blue-800" },
  ready: { label: "Ready", className: "bg-green-100 text-green-800" },
  completed: { label: "Completed", className: "bg-gray-100 text-gray-600" },
};

/**
 * One order in the kitchen queue, rendered entirely from the immutable order
 * snapshots. Brand-new orders get an amber frame + badge so an at-a-glance scan
 * shows what just arrived.
 */
export function OrderCard({
  order,
  timezone,
}: {
  order: KitchenOrder;
  timezone: string;
}) {
  const isNew = order.fulfillmentStatus === "new";
  const badge = STATUS_BADGE[order.fulfillmentStatus];

  return (
    <li
      className={`rounded-lg border p-4 ${
        isNew
          ? "border-amber-300 bg-amber-50 ring-1 ring-amber-200"
          : "border-gray-200 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold text-gray-900">
              {orderReference(order.publicToken)}
            </span>
            {isNew ? (
              <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                New
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-gray-500">
            {formatVenueTime(order.createdAt, timezone)}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${badge.className}`}
        >
          {badge.label}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
          {order.orderType === "dine_in"
            ? `Dine-in · Table ${order.tableLabel ?? "—"}`
            : "Pickup"}
        </span>
        <span className="font-medium text-gray-900">{order.customerName}</span>
        {order.customerPhone ? (
          <a
            href={`tel:${order.customerPhone}`}
            className="text-gray-500 underline hover:text-gray-700"
          >
            {order.customerPhone}
          </a>
        ) : null}
      </div>

      <ul className="mt-3 divide-y divide-gray-100 border-t border-gray-100">
        {order.items.map((item) => (
          <li
            key={item.id}
            className="flex items-start justify-between gap-3 py-2"
          >
            <div className="min-w-0">
              <p className="text-sm text-gray-900">
                <span className="text-gray-500">{item.quantity}×</span>{" "}
                {item.name}
              </p>
              {item.modifiers.length > 0 ? (
                <p className="mt-0.5 text-xs text-gray-500">
                  {item.modifiers.map((modifier) => modifier.name).join(", ")}
                </p>
              ) : null}
            </div>
            <span className="shrink-0 text-sm text-gray-700">
              ${formatCents(item.lineTotalCents)}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2">
        <span className="text-sm font-medium text-gray-900">Total</span>
        <span className="text-base font-semibold text-gray-900">
          ${formatCents(order.totalCents)}
        </span>
      </div>

      <OrderStatusControls orderId={order.id} status={order.fulfillmentStatus} />
    </li>
  );
}
