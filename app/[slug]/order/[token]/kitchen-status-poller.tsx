"use client";

import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

/**
 * Keep the PAID order's tracker moving.
 *
 * The tracker already renders the kitchen's fulfilment status, but nothing was
 * refreshing it once payment had landed — PaymentStatusPoller is mounted only
 * while the order is `pending_payment`. So a diner watching the page saw
 * whatever status existed when they loaded it, forever: the order went
 * new → preparing → ready in the kitchen and their screen never moved. The page
 * even says "we'll let you know the moment it's ready", which is only true when
 * the venue has email/SMS configured; without that the screen WAS the channel,
 * and it was frozen.
 *
 * Deliberately different from the payment poller:
 *
 *  - it does NOT time out. A payment resolves in seconds and a stuck one needs a
 *    calm fallback message; a kitchen legitimately takes 30+ minutes at peak, and
 *    a tracker that gave up would be worse than no tracker.
 *  - it pauses while the tab is hidden and catches up on return, so a phone in a
 *    pocket is not refreshing every 15 seconds for half an hour.
 *  - it unmounts at `completed`, because there is nothing left to watch.
 *
 * 15s rather than the orders board's 12s: this is a diner's phone on mobile data,
 * and a slightly slower tick is invisible to them and cheaper for everyone.
 */
const POLL_INTERVAL_MS = 15_000;

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

export function KitchenStatusPoller() {
  const router = useRouter();
  const hidden = useTabHidden();

  useEffect(() => {
    if (hidden) return;
    // Catch up immediately on return — a diner reopening the tab wants the
    // current state, not the state from 15 seconds' time.
    router.refresh();
    const interval = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [hidden, router]);

  return null;
}
