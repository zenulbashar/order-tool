import { formatVenueTime } from "@/lib/time";

import type { KitchenOrder, KitchenOrderItem, PrintStation } from "./queries";

/**
 * The packaging / front-counter docket: EVERY line in the order in one place, so
 * the person bagging the order can tick off that all of it — food from each prep
 * station and anything unrouted — actually made it into the plate or bag. Lines
 * are grouped under their station heading (in the owner's station order), with a
 * final "Front counter" group for anything not routed to a station, and a total
 * piece count as the assembler's checksum.
 *
 * Prints on the 80mm receipt printer (same width as OrderTicket). Price-free by
 * intent — this is an assembly checklist, not a receipt; the customer receipt
 * carries the money.
 *
 * Presentational only — no hooks. The query imports are type-only, so no
 * server-side module reaches the client bundle.
 */
export function PackagingDocket({
  order,
  stations,
  venueName,
  timezone,
}: {
  order: KitchenOrder;
  stations: PrintStation[];
  venueName: string;
  timezone: string;
}) {
  const isDineIn = order.orderType === "dine_in";

  // Group every line under its station, preserving the owner's station order;
  // lines with no (or a since-deleted) station fall into "Front counter" last.
  const groups: { key: string; heading: string; items: KitchenOrderItem[] }[] =
    [];
  for (const station of stations) {
    const items = order.items.filter((item) => item.stationId === station.id);
    if (items.length > 0) {
      groups.push({ key: station.id, heading: station.name, items });
    }
  }
  const stationIds = new Set(stations.map((s) => s.id));
  const unrouted = order.items.filter(
    (item) => !item.stationId || !stationIds.has(item.stationId),
  );
  if (unrouted.length > 0) {
    // If NOTHING routed to a station, don't shout "Front counter" over a plain
    // list — the whole order is just the order.
    groups.push({
      key: "__front_counter__",
      heading: groups.length > 0 ? "Front counter" : "Items",
      items: unrouted,
    });
  }

  const totalPieces = order.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="mx-auto max-w-[72mm] px-1 py-2 font-mono text-[12px] leading-snug text-black">
      <p className="text-center text-sm font-bold uppercase tracking-wide">
        {venueName}
      </p>
      <p className="text-center text-[11px] font-bold uppercase tracking-widest">
        Packaging
      </p>

      {order.dailyNumber != null ? (
        <p className="mt-1 text-center text-3xl font-extrabold tracking-wider">
          ORDER {order.dailyNumber}
        </p>
      ) : null}
      <p className="text-center text-[11px]">
        {formatVenueTime(order.createdAt, timezone)}
      </p>

      <div className="mt-2 border-2 border-black px-2 py-1.5 text-center">
        <p className="text-lg font-bold uppercase tracking-wide">
          {isDineIn ? "Dine-in" : "Pickup"}
        </p>
        {isDineIn ? (
          <p className="text-base font-bold uppercase">
            Table {order.tableLabel ?? "—"}
          </p>
        ) : null}
        <p className="text-[11px] font-bold uppercase">{order.customerName}</p>
      </div>

      {order.notes ? (
        <div className="mt-2 border-2 border-black px-2 py-1">
          <p className="text-[11px] font-bold uppercase">Notes</p>
          <p className="break-words whitespace-pre-wrap font-bold">
            {order.notes}
          </p>
        </div>
      ) : null}

      <div className="mt-2 border-t border-dashed border-black pt-1">
        {groups.map((group) => (
          <div key={group.key} className="mt-1.5 first:mt-0">
            <p className="text-[10px] font-bold uppercase tracking-widest">
              {group.heading}
            </p>
            <ul>
              {group.items.map((item) => (
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
          </div>
        ))}
      </div>

      <div className="mt-2 flex justify-between border-t-2 border-black pt-1 text-base font-bold">
        <span>Total items</span>
        <span>{totalPieces}</span>
      </div>

      <p className="mt-2 text-center text-[11px]">Check the bag ✓</p>
    </div>
  );
}
