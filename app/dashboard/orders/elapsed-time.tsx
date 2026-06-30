"use client";

import { useSyncExternalStore } from "react";

import { StatusBadge } from "@/app/_components/status-badge";

import type { FulfillmentStatus } from "./queries";

// Minutes an order may wait (since it was placed) before it reads as "late".
// Hardcoded for now; a sensible candidate for a per-venue setting later.
export const LATE_AFTER_MIN = 15;

/* -------------------------------------------------------------------------- */
/*  One shared 30s ticker for every card.                                      */
/*                                                                            */
/*  A single module-level interval drives all ElapsedTime instances, so the    */
/*  board runs ONE timer regardless of order count. Read SSR-safely via         */
/*  useSyncExternalStore — the same sanctioned pattern as orders-auto-refresh's */
/*  Live/Paused indicator: getServerSnapshot returns a stable placeholder (0)   */
/*  so the server (and the first client paint, pre-hydration) never computes a  */
/*  clock value, avoiding a hydration mismatch; the real time arrives once the  */
/*  store is subscribed on mount. getSnapshot returns a cached value that only   */
/*  changes on a tick, so it never churns re-renders.                           */
/* -------------------------------------------------------------------------- */

const TICK_MS = 30_000;

let now = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function tick() {
  now = Date.now();
  for (const listener of listeners) listener();
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  if (timer === null) {
    now = Date.now();
    timer = setInterval(tick, TICK_MS);
  }
  return () => {
    listeners.delete(callback);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const getSnapshot = () => now;
const getServerSnapshot = () => 0;

/** "4m" under an hour, "1h 03m" beyond. Negative skew clamps to 0m. */
function formatElapsed(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

/**
 * Compact "time since placed" indicator for an active kitchen card. Flips to the
 * existing `late` StatusBadge tone once the wait passes LATE_AFTER_MIN — but only
 * while the order is still being worked: a "ready" order is waiting on the
 * customer, and "completed" is done, so neither is ever "late".
 */
export function ElapsedTime({
  placedAt,
  status,
}: {
  placedAt: Date;
  status: FulfillmentStatus;
}) {
  const nowMs = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Pre-hydration: no clock yet — render nothing; the ticker fills it in on mount.
  if (nowMs === 0) return null;

  const elapsedMs = Math.max(0, nowMs - placedAt.getTime());
  const label = formatElapsed(elapsedMs);
  const isLate =
    elapsedMs > LATE_AFTER_MIN * 60_000 &&
    status !== "ready" &&
    status !== "completed";

  if (isLate) {
    return <StatusBadge tone="late">{label}</StatusBadge>;
  }

  return (
    <span className="font-mono text-xs text-muted" aria-label={`${label} elapsed`}>
      {label}
    </span>
  );
}
