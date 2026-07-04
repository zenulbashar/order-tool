"use client";

import { useState, useTransition } from "react";

import { Button } from "@/app/_components/button";
import { formatCents } from "@/lib/validation";

import { setVenuePlanDiscount } from "./actions";

type Mode = "off" | "percent" | "amount";

/**
 * Admin control for a venue's subscription-fee discount (Track E2c). Off / a %
 * off / a fixed $/month off — applied as a Stripe coupon on their subscription.
 * Only ever reduces the fee.
 */
export function PlanDiscountForm({
  venueId,
  mode,
  value,
  hasSubscription,
}: {
  venueId: string;
  mode: Mode;
  value: number;
  hasSubscription: boolean;
}) {
  const [selMode, setSelMode] = useState<Mode>(mode);
  const [pending, startTransition] = useTransition();

  const initialValue =
    mode === "amount" ? formatCents(value) : mode === "percent" ? String(value) : "";

  const control =
    "rounded-input border border-line bg-surface-elevated px-2.5 py-2 text-sm text-ink shadow-sm focus-visible:border-[var(--color-accent)] focus-visible:shadow-[var(--focus-ring-input)] focus-visible:outline-none";
  const microLabel =
    "mb-1 block font-mono text-[9px] font-bold uppercase tracking-wider text-label";

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          await setVenuePlanDiscount(formData);
        })
      }
      className="mt-3"
    >
      <input type="hidden" name="venueId" value={venueId} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className={microLabel}>Discount</span>
          <select
            name="mode"
            value={selMode}
            onChange={(event) => setSelMode(event.target.value as Mode)}
            className={control}
          >
            <option value="off">None (list price)</option>
            <option value="percent">% off</option>
            <option value="amount">$ off / month</option>
          </select>
        </label>
        {selMode !== "off" ? (
          <label className="block">
            <span className={microLabel}>{selMode === "percent" ? "Percent" : "Amount ($)"}</span>
            <input
              name="value"
              inputMode="decimal"
              defaultValue={initialValue}
              placeholder={selMode === "percent" ? "25" : "20.00"}
              className={`${control} w-24`}
            />
          </label>
        ) : (
          <input type="hidden" name="value" value="0" />
        )}
        <Button type="submit" variant="primary" size="sm" loading={pending}>
          Save
        </Button>
      </div>
      {!hasSubscription ? (
        <p className="mt-2 text-[11px] text-warm-deep">
          No active subscription — the discount is saved but only applies once the
          venue is on a paid plan.
        </p>
      ) : null}
    </form>
  );
}
