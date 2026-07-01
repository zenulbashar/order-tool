"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 75_000;

/**
 * While an order is awaiting payment confirmation, softly re-fetch the page so
 * it flips to "Paid" the moment the webhook lands. Polling is BOUNDED: after
 * ~75s it stops and shows a calm, non-alarming "still processing" message
 * rather than spinning forever. There is no owner order view yet, so a stuck
 * payment has no operator recourse — this copy is the customer's only safety
 * net, so it must never read as an error or an endless spinner.
 */
export function PaymentStatusPoller() {
  const router = useRouter();
  const startedAt = useRef<number | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (startedAt.current === null) {
      startedAt.current = Date.now();
    }
    const interval = setInterval(() => {
      const elapsed = Date.now() - (startedAt.current ?? Date.now());
      if (elapsed >= POLL_TIMEOUT_MS) {
        clearInterval(interval);
        setTimedOut(true);
        return;
      }
      // Soft refresh: re-runs the server component (re-reading the order's live
      // status) while preserving this component's state, so the timer keeps
      // counting across refreshes.
      router.refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [router]);

  if (timedOut) {
    return (
      <p className="mt-2 text-sm text-muted">
        Your payment is still processing. You&apos;ll receive confirmation
        shortly — if you&apos;re unsure whether it went through, please check
        with the venue before paying again.
      </p>
    );
  }

  return (
    <p className="mt-2 text-sm text-muted" aria-live="polite">
      Confirming your payment… this page updates automatically.
    </p>
  );
}
