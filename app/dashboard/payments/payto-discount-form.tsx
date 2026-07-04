"use client";

import { useState, useTransition } from "react";

import { Button } from "@/app/_components/button";
import { cx } from "@/app/_components/cx";
import { formatCents } from "@/lib/validation";

import { setPaytoDiscount } from "./actions";

import type { PaytoDiscountMode } from "@/lib/payments/bank-discount";

/**
 * Owner control for the pay-by-bank saving (Track B · 3b-ii). Off / a flat
 * dollar amount / a percentage of the order. The value field adapts to the
 * chosen mode; the server (setPaytoDiscount) re-validates and normalises a
 * zero/blank value back to Off. Never a surcharge — this only ever discounts a
 * bank payment, applied server-side at pay time. A live example mirrors exactly
 * what a diner would see at checkout on a sample order.
 */
const EXAMPLE_ORDER_CENTS = 4000; // a $40 basket

export function PaytoDiscountForm({
  mode,
  value,
}: {
  mode: PaytoDiscountMode;
  value: number;
}) {
  const [selMode, setSelMode] = useState<PaytoDiscountMode>(mode);
  const [val, setVal] = useState(
    mode === "flat" ? formatCents(value) : mode === "percent" ? String(value) : "",
  );
  const [pending, startTransition] = useTransition();

  const numeric = Number.parseFloat(val);
  const hasValue = Number.isFinite(numeric) && numeric > 0;

  // The exact "Save …" line a diner sees at checkout, on a $40 example order.
  let example: string | null = null;
  if (selMode === "percent" && hasValue) {
    const off = Math.round((EXAMPLE_ORDER_CENTS * numeric) / 100);
    example = `Diners see “Save ${numeric}% — pay by bank” at checkout. On a $40 order, that's $${formatCents(off)} off.`;
  } else if (selMode === "flat" && hasValue) {
    const off = Math.round(numeric * 100);
    example = `Diners see “Save $${formatCents(off)} — pay by bank” at checkout, on every bank payment.`;
  }

  const control =
    "rounded-input border border-line bg-surface-elevated px-2.5 py-2 text-sm text-ink shadow-sm focus-visible:border-[var(--color-accent)] focus-visible:shadow-[var(--focus-ring-input)] focus-visible:outline-none";
  const microLabel =
    "mb-1 block font-mono text-[9px] font-bold uppercase tracking-wider text-label";

  const MODES: { id: PaytoDiscountMode; label: string }[] = [
    { id: "off", label: "Off" },
    { id: "percent", label: "Percent" },
    { id: "flat", label: "Amount" },
  ];

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          await setPaytoDiscount(formData);
        })
      }
      className="mt-4 border-t border-line pt-4"
    >
      <input type="hidden" name="mode" value={selMode} />
      <input type="hidden" name="value" value={selMode === "off" ? "0" : val} />

      <p className={microLabel}>Pay-by-bank discount</p>
      <p className="mt-1 text-xs text-muted">
        Reward diners who pay by bank — the saving comes out of your lower fees.
        Shown as a discount at checkout; card prices never change.
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div>
          <span className={microLabel}>Discount type</span>
          <div className="inline-flex gap-1 rounded-[10px] bg-sand p-1">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelMode(m.id)}
                className={cx(
                  "rounded-[7px] px-3 py-1.5 text-xs font-bold transition",
                  selMode === m.id
                    ? "bg-surface-elevated text-ink shadow-sm"
                    : "text-label hover:text-ink",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {selMode !== "off" ? (
          <label className="block">
            <span className={microLabel}>
              {selMode === "flat" ? "Value ($)" : "Value (%)"}
            </span>
            <input
              inputMode="decimal"
              value={val}
              onChange={(event) => setVal(event.target.value)}
              placeholder={selMode === "flat" ? "0.30" : "2"}
              className={`${control} w-24`}
            />
          </label>
        ) : null}

        <Button type="submit" variant="primary" size="sm" loading={pending}>
          Save
        </Button>
      </div>

      {example ? (
        <p className="mt-3 flex items-start gap-2 rounded-control border border-[var(--color-success)]/25 bg-[var(--color-success)]/10 px-3 py-2 text-xs text-ink">
          <span aria-hidden="true" className="text-success-deep">✓</span>
          <span>{example}</span>
        </p>
      ) : null}
    </form>
  );
}
