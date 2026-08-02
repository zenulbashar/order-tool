"use client";

import { useState, useTransition } from "react";
import { inkPillStyles } from "@/app/_components/button-variants";

import { formatCents } from "@/lib/validation";

import { refundOrderAction } from "./refund-actions";

/**
 * Refund control for one order (M4 / audit F3). Deliberately two-step: the
 * button reveals a small form and the form requires a second, explicit
 * submit. Refunds move real money and cannot be undone from this product, so
 * a single mis-tap on a busy kitchen screen must not be able to issue one.
 *
 * Leaving the amount blank refunds everything still outstanding — the common
 * case — so the UI never has to compute a remainder that the server would
 * then have to re-derive. The server re-validates every field regardless.
 */
export function RefundControl({
  orderId,
  totalCents,
  refundedCents,
  status,
}: {
  orderId: string;
  totalCents: number;
  refundedCents: number;
  status: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const remainingCents = Math.max(0, totalCents - refundedCents);
  const fullyRefunded = status === "refunded" || remainingCents === 0;
  const refundable = status === "confirmed" || status === "partially_refunded";

  if (!refundable || fullyRefunded) {
    return refundedCents > 0 ? (
      <p className="text-sm text-muted">
        Refunded ${formatCents(refundedCents)}
        {fullyRefunded ? " — fully refunded" : null}
      </p>
    ) : null;
  }

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await refundOrderAction(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <div className="flex flex-col gap-1">
        {refundedCents > 0 ? (
          <p className="text-sm text-muted">
            Refunded ${formatCents(refundedCents)} of ${formatCents(totalCents)}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-pill border border-line px-4 py-2 text-sm font-semibold text-ink transition hover:bg-sand"
        >
          Refund…
        </button>
      </div>
    );
  }

  return (
    <form action={onSubmit} className="flex w-full flex-col gap-3">
      <input type="hidden" name="orderId" value={orderId} />

      <div className="flex flex-col gap-1">
        <label
          htmlFor={`refund-amount-${orderId}`}
          className="text-sm font-semibold text-ink"
        >
          Amount (leave blank to refund ${formatCents(remainingCents)})
        </label>
        <input
          id={`refund-amount-${orderId}`}
          name="amount"
          type="text"
          inputMode="decimal"
          placeholder={formatCents(remainingCents)}
          className="rounded-control border border-line px-3 py-2 text-base text-ink"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor={`refund-reason-${orderId}`}
          className="text-sm font-semibold text-ink"
        >
          Reason
        </label>
        <select
          id={`refund-reason-${orderId}`}
          name="reason"
          defaultValue="requested_by_customer"
          className="rounded-control border border-line px-3 py-2 text-base text-ink"
        >
          <option value="requested_by_customer">Requested by customer</option>
          <option value="duplicate">Duplicate order</option>
          <option value="fraudulent">Fraudulent</option>
        </select>
      </div>

      {error ? (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className={inkPillStyles}
        >
          {pending ? "Refunding…" : "Confirm refund"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          disabled={pending}
          className="rounded-pill border border-line px-4 py-2 text-sm font-semibold text-ink transition hover:bg-sand disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
