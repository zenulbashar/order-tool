"use client";

import { useState, useTransition } from "react";

import { Button } from "@/app/_components/button";
import { formatCents } from "@/lib/validation";

import { setPaytoDiscount } from "./actions";

import type { PaytoDiscountMode } from "@/lib/payments/bank-discount";

/**
 * Owner control for the pay-by-bank saving (Track B · 3b-ii). Off / a flat
 * dollar amount / a percentage of the order. The value field adapts to the
 * chosen mode; the server (setPaytoDiscount) re-validates and normalises a
 * zero/blank value back to Off. Never a surcharge — this only ever discounts a
 * bank payment, applied server-side at pay time.
 */
export function PaytoDiscountForm({
  mode,
  value,
}: {
  mode: PaytoDiscountMode;
  value: number;
}) {
  const [selMode, setSelMode] = useState<PaytoDiscountMode>(mode);
  const [pending, startTransition] = useTransition();

  // Seed the value field in the units the chosen mode expects.
  const initialValue =
    mode === "flat" ? formatCents(value) : mode === "percent" ? String(value) : "";

  const control =
    "rounded-input border border-line bg-surface-elevated px-2.5 py-2 text-sm text-ink shadow-sm focus-visible:border-[var(--color-accent)] focus-visible:shadow-[var(--focus-ring-input)] focus-visible:outline-none";

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          await setPaytoDiscount(formData);
        })
      }
      className="mt-4 border-t border-line pt-4"
    >
      <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-label">
        Pay-by-bank saving
      </p>
      <p className="mt-1 text-xs text-muted">
        Optionally pass a small saving to customers who pay by bank — it&apos;s
        cheaper for you than cards. Shown as a discount at checkout; card prices
        never change.
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="mb-1 block font-mono text-[9px] font-bold uppercase tracking-wider text-label">
            Discount
          </span>
          <select
            name="mode"
            value={selMode}
            onChange={(event) =>
              setSelMode(event.target.value as PaytoDiscountMode)
            }
            className={control}
          >
            <option value="off">Off</option>
            <option value="flat">Flat amount</option>
            <option value="percent">Percentage</option>
          </select>
        </label>

        {selMode !== "off" ? (
          <label className="block">
            <span className="mb-1 block font-mono text-[9px] font-bold uppercase tracking-wider text-label">
              {selMode === "flat" ? "Amount ($)" : "Percent (%)"}
            </span>
            <input
              name="value"
              inputMode="decimal"
              defaultValue={initialValue}
              placeholder={selMode === "flat" ? "0.30" : "1"}
              className={`${control} w-28`}
            />
          </label>
        ) : (
          <input type="hidden" name="value" value="0" />
        )}

        <Button type="submit" variant="primary" size="sm" loading={pending}>
          Save
        </Button>
      </div>
    </form>
  );
}
