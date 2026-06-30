"use client";

import { useState } from "react";

import { Segmented, type SegmentedOption } from "@/app/_components/segmented";

import { OrderCard } from "./order-card";
import type { FulfillmentStatus, KitchenOrder } from "./queries";

// Order-type filter. "all" is no filter; the other two map to the orderType enum
// (Takeaway = pickup). Pure client-side over already-fetched orders — no query.
type TypeFilter = "all" | "dine_in" | "pickup";

const FILTERS: SegmentedOption<TypeFilter>[] = [
  { label: "All", value: "all" },
  { label: "Dine-in", value: "dine_in" },
  { label: "Takeaway", value: "pickup" },
];

// The active board columns, in forward order. COMPLETED is fed by the bounded
// recent-completed query (always visible) and rendered compactly.
const BOARD_COLUMNS: { status: FulfillmentStatus; label: string }[] = [
  { status: "new", label: "New" },
  { status: "preparing", label: "Preparing" },
  { status: "ready", label: "Ready" },
  { status: "completed", label: "Completed" },
];

/**
 * Client board chrome: the order-type filter pills plus the Scheduled band and
 * the four status columns, all rendered over the server-fetched orders. The
 * filter is ephemeral UI state (resets on load, not persisted) and is applied
 * consistently to every section — so the column header counts reflect the
 * FILTERED population, not the totals. The make-now / upcoming split itself is
 * computed on the server and passed in unchanged.
 */
export function OrdersBoard({
  makeNowOrders,
  upcomingOrders,
  completedOrders,
  timezone,
}: {
  makeNowOrders: KitchenOrder[];
  upcomingOrders: KitchenOrder[];
  completedOrders: KitchenOrder[];
  timezone: string;
}) {
  const [filter, setFilter] = useState<TypeFilter>("all");

  const matches = (order: KitchenOrder) =>
    filter === "all" || order.orderType === filter;

  const upcoming = upcomingOrders.filter(matches);
  const makeNow = makeNowOrders.filter(matches);
  const completed = completedOrders.filter(matches);

  // Bucket the filtered make-now population by status; COMPLETED draws from the
  // filtered bounded set. Counts below derive from exactly these arrays.
  const ordersFor = (status: FulfillmentStatus) =>
    status === "completed"
      ? completed
      : makeNow.filter((order) => order.fulfillmentStatus === status);

  return (
    <>
      <div className="px-5 pt-6">
        <Segmented
          options={FILTERS}
          value={filter}
          onChange={setFilter}
          label="Filter orders by type"
        />
      </div>

      {upcoming.length > 0 ? (
        <section className="mt-6 border-t border-line px-5 py-6">
          <h2 className="text-sm font-semibold text-ink">
            Scheduled (upcoming) ({upcoming.length})
          </h2>
          <p className="mt-1 text-xs text-muted">
            Pre-orders shown by pickup time. Each moves into the board when it is
            due.
          </p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {upcoming.map((order) => (
              <OrderCard key={order.id} order={order} timezone={timezone} />
            ))}
          </ul>
        </section>
      ) : null}

      <section className="px-5 py-8">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {BOARD_COLUMNS.map((column) => {
            const orders = ordersFor(column.status);
            const isCompleted = column.status === "completed";
            return (
              <div key={column.status} className="min-w-0">
                <div className="flex items-baseline justify-between gap-2 border-b border-line pb-2">
                  <h2 className="text-sm font-semibold text-ink">
                    {column.label}
                  </h2>
                  <span className="font-mono text-xs font-bold text-muted">
                    {orders.length}
                  </span>
                </div>
                {orders.length === 0 ? (
                  <p className="mt-3 rounded-card border border-dashed border-line p-6 text-center text-xs text-muted">
                    {isCompleted ? "Nothing completed recently" : "No orders"}
                  </p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {orders.map((order) => (
                      <OrderCard
                        key={order.id}
                        order={order}
                        timezone={timezone}
                        compact={isCompleted}
                        showElapsed={!isCompleted}
                      />
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
