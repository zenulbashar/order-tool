"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/app/_components/button";
import { cx } from "@/app/_components/cx";
import { Segmented, type SegmentedOption } from "@/app/_components/segmented";

import {
  playNewOrderBeep,
  setSoundEnabled,
  unlockAudio,
  useSoundEnabled,
} from "./kitchen-sound";
import { OrderCard } from "./order-card";
import type { FulfillmentStatus, KitchenOrder } from "./queries";
import { TicketDrawer } from "./ticket-drawer";

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
 * Client board chrome: the order-type filter pills, sound + fullscreen toggles,
 * the Scheduled band, and the four status columns — all rendered over the
 * server-fetched orders. The type filter is ephemeral UI state (resets on load)
 * applied consistently to every section, so the column counts reflect the
 * FILTERED population. The make-now / upcoming split itself is computed on the
 * server and passed in unchanged.
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
  const soundEnabled = useSoundEnabled();

  // Focused ticket drawer: hold the order ID and re-derive the live order each
  // render, so board refreshes keep the drawer in sync (and it auto-closes when
  // the order leaves the visible sets).
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeOrder = activeId
    ? [...makeNowOrders, ...upcomingOrders, ...completedOrders].find(
        (order) => order.id === activeId,
      ) ?? null
    : null;

  // New-order chime. CRITICAL: the diff input is the UNFILTERED make-now prop
  // (just narrowed to status "new"), NOT the post-filter `makeNow` array below —
  // a kitchen filtered to "Dine-in" must still hear a new Takeaway order arrive.
  const newOrderIds = useMemo(
    () =>
      makeNowOrders
        .filter((order) => order.fulfillmentStatus === "new")
        .map((order) => order.id),
    [makeNowOrders],
  );
  // Seed on mount with the orders already on screen, so a page load never blasts
  // the chime for the existing queue — only genuinely new arrivals trigger it.
  const seenNewIds = useRef<Set<string> | null>(null);
  if (seenNewIds.current === null) seenNewIds.current = new Set(newOrderIds);

  useEffect(() => {
    const seen = seenNewIds.current!;
    const fresh = newOrderIds.filter((id) => !seen.has(id));
    if (fresh.length === 0) return;
    // Always mark fresh IDs seen (even when muted), so toggling sound ON later
    // never replays a backlog — only orders arriving after that point chime.
    if (soundEnabled) playNewOrderBeep();
    for (const id of fresh) seen.add(id);
  }, [newOrderIds, soundEnabled]);

  const toggleSound = () => {
    const next = !soundEnabled;
    // Turning ON is the user gesture that unlocks the AudioContext (autoplay).
    if (next) unlockAudio();
    setSoundEnabled(next);
  };

  // Fullscreen the whole board chrome (pills + scheduled + columns), so a
  // filtered/scheduled view stays visible in fullscreen. The listener keeps the
  // label in sync when the user exits with Esc rather than the button.
  const boardRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () =>
      setIsFullscreen(document.fullscreenElement === boardRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFullscreen = () => {
    const el = boardRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  };

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
    // bg-surface so fullscreen shows the cream board, not a black backdrop.
    <div
      ref={boardRef}
      className={cx("bg-surface", isFullscreen && "h-dvh overflow-y-auto")}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-6">
        <Segmented
          options={FILTERS}
          value={filter}
          onChange={setFilter}
          label="Filter orders by type"
        />
        <div className="flex items-center gap-2">
          <Button
            variant={soundEnabled ? "primary" : "secondary"}
            size="sm"
            aria-pressed={soundEnabled}
            onClick={toggleSound}
          >
            {soundEnabled ? "🔔 Sound on" : "🔕 Sound off"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            aria-pressed={isFullscreen}
            onClick={toggleFullscreen}
          >
            {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          </Button>
        </div>
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
              <OrderCard
                key={order.id}
                order={order}
                timezone={timezone}
                onOpen={() => setActiveId(order.id)}
              />
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
                <div className="flex items-center justify-between gap-2 border-b border-line pb-2">
                  <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-ink">
                    {column.label}
                  </h2>
                  <span className="rounded-pill bg-sand px-2 py-0.5 font-mono text-[10px] font-bold text-muted">
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
                        onOpen={
                          isCompleted ? undefined : () => setActiveId(order.id)
                        }
                      />
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {activeOrder ? (
        <TicketDrawer
          order={activeOrder}
          timezone={timezone}
          onClose={() => setActiveId(null)}
        />
      ) : null}
    </div>
  );
}
