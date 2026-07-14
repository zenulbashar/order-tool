"use client";

import { useState } from "react";

import { Button } from "@/app/_components/button";
import { cx } from "@/app/_components/cx";

import { createBillingCheckout } from "./actions";

/**
 * Side-by-side Pro vs Scale comparison (deferred design-arc grid). Feature rows
 * come straight from the entitlement model (lib/billing/plans.ts) so the grid can
 * never claim something a tier doesn't actually unlock; prices stay on the secure
 * Stripe Checkout page (the CTA posts createBillingCheckout with the chosen plan
 * + interval). Client-only for the interval toggle — no writes here.
 */
const ROWS: { label: string; pro: boolean; scale: boolean }[] = [
  { label: "Branded online storefront", pro: true, scale: true },
  { label: "Menu, cart & online checkout", pro: true, scale: true },
  { label: "Kitchen board, tables & QR codes", pro: true, scale: true },
  { label: "Scheduled pickup & dine-in", pro: true, scale: true },
  { label: "Stock, recipe costing & suggestions", pro: true, scale: true },
  { label: "Design studio (menus & banners)", pro: true, scale: true },
  { label: "AI ordering concierge", pro: true, scale: true },
  { label: "AI menu import & descriptions", pro: true, scale: true },
  { label: "Multiple venues / locations", pro: false, scale: true },
  { label: "Custom storefront domain", pro: false, scale: true },
];

function Mark({ on }: { on: boolean }) {
  return on ? (
    <svg
      viewBox="0 0 24 24"
      className="mx-auto h-4 w-4 text-[var(--color-success)]"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="Included"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ) : (
    <span className="mx-auto block h-px w-3 bg-line-strong" aria-label="Not included" />
  );
}

export function PlanComparison({
  currentPlan,
  hasCustomer,
}: {
  currentPlan: string;
  hasCustomer: boolean;
}) {
  const [interval, setInterval] = useState<"monthly" | "annual">("monthly");

  const columns = [
    { plan: "pro" as const, name: "Pro", pick: (r: (typeof ROWS)[number]) => r.pro },
    { plan: "scale" as const, name: "Scale", pick: (r: (typeof ROWS)[number]) => r.scale },
  ];

  return (
    <div>
      {/* Interval toggle — annual billing is discounted (shown on Checkout). */}
      <div className="mt-3 inline-flex gap-1 rounded-[10px] bg-sand p-1">
        {(["monthly", "annual"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setInterval(value)}
            aria-pressed={interval === value}
            className={cx(
              "rounded-[7px] px-3.5 py-1.5 text-xs font-bold capitalize transition",
              interval === value
                ? "bg-surface-elevated text-ink shadow-sm"
                : "text-label hover:text-ink",
            )}
          >
            {value === "annual" ? "Annual · save" : "Monthly"}
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-hidden rounded-card border border-line">
        {/* Header: plan names + Choose CTAs. */}
        <div className="grid grid-cols-[1fr_5rem_5rem] items-stretch border-b border-line bg-hover-secondary sm:grid-cols-[1fr_8rem_8rem]">
          <div className="px-3 py-3" />
          {columns.map((col) => {
            const isCurrent = currentPlan === col.plan;
            return (
              <div key={col.plan} className="border-l border-line px-2 py-3 text-center">
                <p className="font-display text-sm font-extrabold text-ink">
                  {col.name}
                </p>
                {isCurrent ? (
                  <span className="mt-1 inline-flex items-center rounded-full bg-[var(--color-success)]/15 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-success-deep">
                    Current
                  </span>
                ) : (
                  <form action={createBillingCheckout} className="mt-1.5">
                    <input type="hidden" name="plan" value={col.plan} />
                    <input type="hidden" name="interval" value={interval} />
                    <Button type="submit" variant="primary" size="sm" className="w-full">
                      Choose
                    </Button>
                  </form>
                )}
              </div>
            );
          })}
        </div>

        {/* Feature rows. */}
        <ul>
          {ROWS.map((row) => (
            <li
              key={row.label}
              className="grid grid-cols-[1fr_5rem_5rem] items-center border-b border-line/60 last:border-0 sm:grid-cols-[1fr_8rem_8rem]"
            >
              <span className="px-3 py-2.5 text-[13px] text-ink">{row.label}</span>
              <span className="border-l border-line/60 px-2 py-2.5">
                <Mark on={row.pro} />
              </span>
              <span className="border-l border-line/60 px-2 py-2.5">
                <Mark on={row.scale} />
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-3 text-xs text-muted">
        {hasCustomer
          ? "Choosing a plan opens secure Stripe Checkout to update your subscription. Annual billing is discounted."
          : "Choosing a plan opens secure Stripe Checkout. Annual billing is discounted; your card is never stored by us."}
      </p>
    </div>
  );
}
