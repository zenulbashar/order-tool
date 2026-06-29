"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";

import { usePrint } from "./print-context";

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
 * returning operator sees the latest queue at once. It also pauses while an
 * order ticket is printing: the staged ticket already survives a refresh (it's
 * held in client state), but pausing avoids any churn under the print dialog.
 */
export function OrdersAutoRefresh() {
  const router = useRouter();
  const hidden = useTabHidden();
  const { isPrinting } = usePrint();
  const mounted = useRef(false);

  useEffect(() => {
    const isFirstRun = !mounted.current;
    mounted.current = true;

    // Backgrounded or printing: no polling, no interval to clean up.
    if (hidden || isPrinting) return;

    // Catch up immediately when polling resumes (tab visible again, or print
    // finished), but not on the very first run — the page was just
    // server-rendered, so it's already current.
    if (!isFirstRun) router.refresh();

    const interval = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [hidden, isPrinting, router]);

  return (
    <p className="flex items-center gap-1.5 text-xs text-muted">
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${
          hidden ? "bg-line" : "bg-[var(--color-success)]"
        }`}
      />
      {hidden ? "Paused" : "Live · updates every 12s"}
    </p>
  );
}
