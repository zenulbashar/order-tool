"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const POLL_INTERVAL_MS = 30_000;

function subscribeVisibility(callback: () => void) {
  document.addEventListener("visibilitychange", callback);
  return () => document.removeEventListener("visibilitychange", callback);
}

function useTabHidden(): boolean {
  return useSyncExternalStore(
    subscribeVisibility,
    () => document.hidden,
    () => false,
  );
}

/**
 * The owner's live "a table was just booked" popup.
 *
 * It watches `count` — the number of UPCOMING, LIVE bookings, computed on the
 * server — and pops when that number RISES. Watching a server-computed count
 * rather than timestamps is what keeps this honest across tabs and refreshes:
 * seating or cancelling a booking lowers the count, so a rise can only mean a
 * new booking arrived.
 *
 * It polls with router.refresh() on the same principle as the kitchen board's
 * OrdersAutoRefresh (pause while hidden, catch up on return), just slower —
 * bookings arrive at a human pace, not a service pace, and a dashboard tab left
 * open all day should not poll every 12 seconds for them.
 *
 * The FIRST render never pops. `seen` is seeded from the initial count, so
 * opening a page that already has bookings is not an event; only a change while
 * you are watching is.
 */
export function NewBookingAlert({
  count,
  href = "/dashboard/bookings",
}: {
  count: number;
  href?: string;
}) {
  const router = useRouter();
  const hidden = useTabHidden();
  const seen = useRef(count);
  const mounted = useRef(false);
  const [arrived, setArrived] = useState(0);

  useEffect(() => {
    if (count > seen.current) setArrived(count - seen.current);
    // Track downward moves too (seated/cancelled), so the next rise is measured
    // from the current floor rather than a stale high-water mark.
    seen.current = count;
  }, [count]);

  useEffect(() => {
    const isFirstRun = !mounted.current;
    mounted.current = true;
    if (hidden) return;
    if (!isFirstRun) router.refresh();
    const interval = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [hidden, router]);

  if (arrived <= 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-[calc(env(safe-area-inset-bottom)+16px)] left-1/2 z-toast w-[min(420px,calc(100vw-32px))] -translate-x-1/2 rounded-card border border-accent bg-surface-elevated p-4 shadow-[0_20px_50px_-20px_rgba(13,29,22,0.5)]"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-[var(--color-success)] p2e-glow"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink">
            {arrived === 1
              ? "New table booking"
              : `${arrived} new table bookings`}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Just came in from your storefront.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={href}
            onClick={() => setArrived(0)}
            className="rounded-control bg-ink px-3 py-1.5 text-xs font-bold text-surface transition hover:opacity-90"
          >
            View
          </Link>
          <button
            type="button"
            onClick={() => setArrived(0)}
            aria-label="Dismiss"
            className="rounded-control px-2 py-1.5 text-xs font-bold text-muted transition hover:bg-sand hover:text-ink"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
