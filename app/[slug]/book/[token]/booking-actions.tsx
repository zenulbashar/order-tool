"use client";

import { useState, useTransition } from "react";

import { Button } from "@/app/_components/button";

import { cancelBooking } from "./actions";

/**
 * Cancel control on the diner's booking page.
 *
 * Two-step by design: a booking is a commitment on both sides, and a
 * single-tap cancel on a link that may be opened months later (or by a
 * mis-tap in a mail client) is too easy to fire by accident. The repo's
 * <ConfirmSubmit> covers form-action deletes; this is a transition-driven
 * server action, so it confirms inline instead.
 */
export function BookingActions({ token }: { token: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function doCancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelBooking(token);
      if (result.ok) {
        // Server-rendered page: reload so the status block reflects the row.
        window.location.reload();
      } else {
        setError(result.error ?? "That didn't work. Please call the venue.");
        setConfirming(false);
      }
    });
  }

  if (!confirming) {
    return (
      <div className="mt-6">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="text-sm font-semibold text-muted underline hover:text-ink"
        >
          Cancel this booking
        </button>
        {error ? (
          <p className="mt-2 text-sm text-[var(--color-warm)]" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-card border border-line bg-surface-elevated p-4">
      <p className="text-sm font-semibold text-ink">
        Cancel this booking?
      </p>
      <p className="mt-1 text-sm text-muted">
        We&apos;ll give the table to someone else. You can always book again.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="destructive"
          size="sm"
          loading={pending}
          onClick={doCancel}
        >
          Yes, cancel it
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setConfirming(false)}
        >
          Keep my booking
        </Button>
      </div>
      {error ? (
        <p className="mt-2 text-sm text-[var(--color-warm)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
