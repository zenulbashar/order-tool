"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Card / wallet: resolves in seconds, so a short bounded poll is right.
const DEFAULT_INTERVAL_MS = 4000;
const DEFAULT_TIMEOUT_MS = 75_000;
// Bank (PayTo): the customer approves a mandate in their banking app, which can
// take minutes, and Stripe has no published approval timeout — so poll gently
// for much longer before the calm fallback.
const BANK_INTERVAL_MS = 6000;
const BANK_TIMEOUT_MS = 600_000;

/**
 * While an order is awaiting payment confirmation, softly re-fetch the page so
 * it flips to "Paid" the moment the webhook lands. Polling is BOUNDED and
 * method-aware: a card/wallet payment resolves in seconds; a bank (PayTo)
 * payment is approved out-of-band and can take minutes, so the "bank" variant
 * polls gently for far longer and its copy reassures rather than alarms. After
 * the window it stops and shows a calm "still processing" message — never an
 * error, never an endless spinner (there is no owner order view to recover a
 * stuck payment, so this copy is the customer's only safety net).
 */
export function PaymentStatusPoller({
  variant = "default",
}: {
  variant?: "default" | "bank";
}) {
  const router = useRouter();
  const startedAt = useRef<number | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  const isBank = variant === "bank";
  const intervalMs = isBank ? BANK_INTERVAL_MS : DEFAULT_INTERVAL_MS;
  const timeoutMs = isBank ? BANK_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;

  useEffect(() => {
    if (startedAt.current === null) {
      startedAt.current = Date.now();
    }
    const interval = setInterval(() => {
      const elapsed = Date.now() - (startedAt.current ?? Date.now());
      if (elapsed >= timeoutMs) {
        clearInterval(interval);
        setTimedOut(true);
        return;
      }
      // Soft refresh: re-runs the server component (re-reading the order's live
      // status) while preserving this component's state, so the timer keeps
      // counting across refreshes.
      router.refresh();
    }, intervalMs);
    return () => clearInterval(interval);
  }, [router, intervalMs, timeoutMs]);

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
      {isBank
        ? "Waiting for your bank to confirm… this page updates automatically once you approve."
        : "Confirming your payment… this page updates automatically."}
    </p>
  );
}
