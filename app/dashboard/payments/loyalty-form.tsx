"use client";

import { useState, useTransition } from "react";

import { Button } from "@/app/_components/button";
import { Toggle } from "@/app/_components/selection-controls";
import { formatCents } from "@/lib/validation";

import { setLoyaltyConfig } from "./actions";

/**
 * Owner control for customer loyalty/points (PR1 — money-inert). Enable, set how
 * many points a $1 of spend earns, pick the redemption ratio (points that buy
 * $1), and a minimum-redeem floor. Enabling changes no existing charge — diners
 * simply start earning on confirmed orders; redemption ships in a later build.
 * The server (setLoyaltyConfig) re-validates + clamps everything. A live example
 * mirrors what a diner earns on a sample order.
 */
const EXAMPLE_ORDER_CENTS = 4000; // a $40 basket

// Redemption ratios as (cents-per-point → label). Constrained so the redeem
// math stays exact and the owner picks a familiar "N points = $1".
const REDEEM_OPTIONS: { cents: number; label: string }[] = [
  { cents: 1, label: "100 points = $1" },
  { cents: 2, label: "50 points = $1" },
  { cents: 5, label: "20 points = $1" },
  { cents: 10, label: "10 points = $1" },
];

export function LoyaltyForm({
  enabled,
  earnRatePerDollar,
  redeemValueCents,
  minRedeemPoints,
}: {
  enabled: boolean;
  earnRatePerDollar: number;
  redeemValueCents: number;
  minRedeemPoints: number;
}) {
  const [on, setOn] = useState(enabled);
  const [earn, setEarn] = useState(String(earnRatePerDollar || 1));
  const [redeem, setRedeem] = useState(String(redeemValueCents || 1));
  const [min, setMin] = useState(String(minRedeemPoints || 0));
  const [pending, startTransition] = useTransition();

  const control =
    "rounded-input border border-line bg-surface-elevated px-2.5 py-2 text-sm text-ink shadow-sm focus-visible:border-[var(--color-accent)] focus-visible:shadow-[var(--focus-ring-input)] focus-visible:outline-none";
  const microLabel =
    "mb-1 block font-mono text-[9px] font-bold uppercase tracking-wider text-label";

  const earnNum = Number(earn);
  const redeemNum = Number(redeem);
  const validEarn = Number.isFinite(earnNum) && earnNum > 0;
  const validRedeem = REDEEM_OPTIONS.some((o) => o.cents === redeemNum);
  const exampleEarned = validEarn
    ? Math.floor(EXAMPLE_ORDER_CENTS / 100) * earnNum
    : 0;
  const exampleValue = validRedeem ? exampleEarned * redeemNum : 0;

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          await setLoyaltyConfig(formData);
        })
      }
      className="mt-4 border-t border-line pt-4"
    >
      {on ? <input type="hidden" name="enabled" value="on" /> : null}

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className={microLabel}>Customer loyalty</p>
          <p className="mt-1 text-xs text-muted">
            Signed-in diners earn points on every confirmed order. Points show on
            their account and can be redeemed for a discount at checkout.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`font-mono text-[10px] font-bold uppercase tracking-wider ${
              on ? "text-success-deep" : "text-label"
            }`}
          >
            {on ? "On" : "Off"}
          </span>
          <Toggle checked={on} onChange={setOn} label="Enable loyalty" />
        </div>
      </div>

      {on ? (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className={microLabel}>Earn rate</span>
            <div className="flex items-center gap-1.5">
              <input
                inputMode="numeric"
                name="earnRatePerDollar"
                value={earn}
                onChange={(event) => setEarn(event.target.value)}
                placeholder="1"
                className={`${control} w-16`}
              />
              <span className="text-xs text-muted">pts / $1</span>
            </div>
          </label>

          <label className="block">
            <span className={microLabel}>Redemption</span>
            <select
              name="redeemValueCents"
              value={redeem}
              onChange={(event) => setRedeem(event.target.value)}
              className={`${control} w-44`}
            >
              {REDEEM_OPTIONS.map((o) => (
                <option key={o.cents} value={o.cents}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className={microLabel}>Min to redeem</span>
            <div className="flex items-center gap-1.5">
              <input
                inputMode="numeric"
                name="minRedeemPoints"
                value={min}
                onChange={(event) => setMin(event.target.value)}
                placeholder="0"
                className={`${control} w-20`}
              />
              <span className="text-xs text-muted">pts</span>
            </div>
          </label>
        </div>
      ) : (
        // Keep the values in the POST even while disabling, so re-enabling
        // later restores the same config.
        <>
          <input type="hidden" name="earnRatePerDollar" value={earn} />
          <input type="hidden" name="redeemValueCents" value={redeem} />
          <input type="hidden" name="minRedeemPoints" value={min} />
        </>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        {on && validEarn && validRedeem ? (
          <p className="min-w-0 flex-1 text-xs text-muted">
            A $40 order earns{" "}
            <span className="font-semibold text-ink">
              {exampleEarned} points
            </span>{" "}
            (worth ${formatCents(exampleValue)}).
          </p>
        ) : (
          <span className="flex-1" />
        )}
        <Button type="submit" variant="primary" size="sm" loading={pending}>
          Save
        </Button>
      </div>
    </form>
  );
}
