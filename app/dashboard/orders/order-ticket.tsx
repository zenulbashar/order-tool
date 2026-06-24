import { formatVenueTime } from "@/lib/time";
import { formatCents, orderReference } from "@/lib/validation";

import type { KitchenOrder } from "./queries";

/**
 * Print-only paper ticket for a single order, rendered entirely from the
 * immutable order snapshots (order_items / order_item_modifiers) — never a
 * live-menu join, the same immutability principle as the customer confirmation
 * page and the kitchen card.
 *
 * Laid out as a single narrow column so it prints cleanly to an 80mm thermal
 * receipt printer (~72mm printable) and still reads on A4: max-w caps the width
 * rather than forcing a paper size, so it fills 58mm paper and never hard-breaks
 * on a wider sheet. The order-type banner uses a BORDER, not a filled
 * background, so it prints without "background graphics" enabled.
 *
 * Presentational only — no hooks, no state. The KitchenOrder import is
 * type-only, so none of the server-side query module reaches the client bundle.
 */
export function OrderTicket({
  order,
  venueName,
  timezone,
}: {
  order: KitchenOrder;
  venueName: string;
  timezone: string;
}) {
  const isDineIn = order.orderType === "dine_in";

  return (
    <div className="mx-auto max-w-[72mm] px-1 py-2 font-mono text-[12px] leading-snug text-black">
      <p className="text-center text-sm font-bold uppercase tracking-wide">
        {venueName}
      </p>

      <p className="mt-1 text-center text-2xl font-bold tracking-wider">
        {orderReference(order.publicToken)}
      </p>
      <p className="text-center text-[11px]">
        {formatVenueTime(order.createdAt, timezone)}
      </p>

      {/* The single most important line for the kitchen: how to fulfil it. */}
      <div className="mt-2 border-2 border-black px-2 py-1.5 text-center">
        <p className="text-lg font-bold uppercase tracking-wide">
          {isDineIn ? "Dine-in" : "Pickup"}
        </p>
        {isDineIn ? (
          <p className="text-base font-bold uppercase">
            Table {order.tableLabel ?? "—"}
          </p>
        ) : null}
      </div>

      <div className="mt-2 border-t border-dashed border-black pt-1">
        <p className="font-bold">{order.customerName}</p>
        {order.customerPhone ? <p>{order.customerPhone}</p> : null}
      </div>

      <ul className="mt-2 border-t border-dashed border-black pt-1">
        {order.items.map((item) => (
          <li key={item.id} className="mt-1 first:mt-0">
            <div className="flex justify-between gap-2">
              <span className="font-bold">
                {item.quantity}× {item.name}
              </span>
              <span className="font-bold">${formatCents(item.lineTotalCents)}</span>
            </div>
            {item.modifiers.length > 0 ? (
              <ul className="pl-3">
                {item.modifiers.map((modifier) => (
                  <li key={modifier.id}>+ {modifier.name}</li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="mt-2 flex justify-between border-t-2 border-black pt-1 text-base font-bold">
        <span>Total</span>
        <span>${formatCents(order.totalCents)}</span>
      </div>

      <p className="mt-3 text-center text-[11px]">Thank you</p>
    </div>
  );
}
