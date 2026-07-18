import {
  formatStationTag,
  type StationLabel as StationLabelData,
} from "@/lib/orders/station";

import type { KitchenOrder, KitchenOrderItem } from "./queries";

/**
 * A single per-station sticky/label docket, sized for a small label roll
 * (~50mm). Shows ONLY this station's lines in full, then collapses every other
 * line in the order to one "+N more items" tally — so the person at the kebab
 * station reads exactly what to make plus how many pieces round out the same
 * order, without the foreign item names eating the tiny label surface.
 *
 * Deliberately price-free: a station label is a make-ticket, not a receipt.
 * Headed by the loud `<dailyNumber>-<code>` tag (e.g. "42-K") so a stack of
 * labels for the same order is instantly sortable by eye.
 *
 * Presentational only — no hooks. Each label sets `break-after-page` so a run of
 * them (one per station) feeds one label at a time through the printer.
 */
export function StationLabelDocket({
  label,
  order,
}: {
  label: StationLabelData<KitchenOrderItem>;
  order: KitchenOrder;
}) {
  const isDineIn = order.orderType === "dine_in";
  const tag = formatStationTag(order.dailyNumber, label.station.code);

  return (
    <div className="mx-auto max-w-[50mm] break-after-page px-1 py-2 font-mono text-[12px] leading-snug text-black">
      {/* The load-bearing line: order number + station initial, huge. */}
      <p className="text-center text-4xl font-extrabold tracking-wider">
        {tag}
      </p>
      <p className="mt-0.5 text-center text-[11px] font-bold uppercase tracking-widest">
        {label.station.name}
      </p>

      <div className="mt-1 border-y border-dashed border-black py-0.5 text-center text-[10px] font-bold uppercase">
        {isDineIn ? `Dine-in · Table ${order.tableLabel ?? "—"}` : "Pickup"}
      </div>

      <ul className="mt-1">
        {label.items.map((item) => (
          <li key={item.id} className="mt-1 first:mt-0">
            <p className="font-bold break-words">
              {item.quantity}× {item.name}
              {item.variantName ? ` (${item.variantName})` : ""}
            </p>
            {item.modifiers.length > 0 ? (
              <ul className="pl-3">
                {item.modifiers.map((modifier) => (
                  <li key={modifier.id} className="break-words">
                    + {modifier.name}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>

      {label.otherItemCount > 0 ? (
        <p className="mt-1 border-t border-dashed border-black pt-1 text-[11px] font-bold">
          + {label.otherItemCount} more{" "}
          {label.otherItemCount === 1 ? "item" : "items"}
        </p>
      ) : null}
    </div>
  );
}
