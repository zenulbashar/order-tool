"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";

const POLL_INTERVAL_MS = 12_000;

/** Subscribe to tab visibility changes; returns an unsubscribe. */
function subscribeVisibility(callback: () => void) {
  document.addEventListener("visibilitychange", callback);
  return () => document.removeEventListener("visibilitychange", callback);
}

/**
 * Current tab-hidden state, read SSR-safely: the server (and the initial client
 * snapshot, before hydration) reports "visible", and visibilitychange drives
 * updates thereafter. useSyncExternalStore is the sanctioned way to subscribe to
 * external browser state without setting React state inside an effect.
 */
function useTabHidden(): boolean {
  return useSyncExternalStore(
    subscribeVisibility,
    () => document.hidden,
    () => false,
  );
}

/**
 * Keeps the kitchen queue current without a manual reload. While the tab is
 * visible, a fixed interval calls router.refresh(), which re-runs the
 * force-dynamic server component (re-checking auth + re-running the venue-scoped
 * query) and merges the fresh server output while preserving client state and
 * scroll position.
 *
 * Unlike the customer-side PaymentStatusPoller this never times out — the screen
 * runs all shift — but it pauses while the tab is hidden (no interval at all)
 * and refreshes once immediately when the tab becomes visible again, so a
 * returning operator sees the latest queue at once.
 */
export function OrdersAutoRefresh() {
  const router = useRouter();
  const hidden = useTabHidden();
  const mounted = useRef(false);

  useEffect(() => {
    const isFirstRun = !mounted.current;
    mounted.current = true;

    if (hidden) return; // backgrounded: no polling, no interval to clean up.

    // Catch up immediately when returning to a visible tab, but not on the very
    // first run — the page was just server-rendered, so it's already current.
    if (!isFirstRun) router.refresh();

    const interval = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [hidden, router]);

  return (
    <p className="flex items-center gap-1.5 text-xs text-gray-400">
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${
          hidden ? "bg-gray-300" : "bg-green-500"
        }`}
      />
      {hidden ? "Paused" : "Live · updates every 12s"}
    </p>
  );
}
