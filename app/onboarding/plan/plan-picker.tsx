"use client";

import { useState } from "react";

import { createBillingCheckout } from "@/app/dashboard/billing/actions";

type Interval = "monthly" | "annual";

const PLANS = [
  {
    plan: "pro",
    name: "Pro",
    popular: true,
    tagline: "Everything to run one venue.",
    features: [
      "Full ordering platform",
      "Diner AI concierge",
      "AI menu import and descriptions",
    ],
  },
  {
    plan: "scale",
    name: "Scale",
    popular: false,
    tagline: "For groups and multiple venues.",
    features: [
      "Everything in Pro",
      "Multiple venues",
      "Custom domain",
    ],
  },
] as const;

const toggleBase =
  "rounded-full px-4 py-1.5 text-sm font-medium transition";

export function PlanPicker() {
  const [interval, setInterval] = useState<Interval>("monthly");

  return (
    <div className="space-y-5">
      <div className="flex justify-center">
        <div className="inline-flex rounded-full border border-sand bg-surface p-1">
          <button
            type="button"
            onClick={() => setInterval("monthly")}
            className={`${toggleBase} ${
              interval === "monthly"
                ? "bg-forest text-surface-elevated"
                : "text-muted"
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setInterval("annual")}
            className={`${toggleBase} ${
              interval === "annual"
                ? "bg-forest text-surface-elevated"
                : "text-muted"
            }`}
          >
            Annual
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {PLANS.map((tier) => (
          <form
            key={tier.plan}
            action={createBillingCheckout}
            className={`relative flex flex-col rounded-xl border p-5 ${
              tier.popular ? "border-forest" : "border-sand"
            }`}
          >
            {tier.popular ? (
              <span className="absolute -top-2.5 left-5 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-ink">
                Most popular
              </span>
            ) : null}
            <input type="hidden" name="plan" value={tier.plan} />
            <input type="hidden" name="interval" value={interval} />
            <input type="hidden" name="returnTo" value="wizard" />

            <h2 className="font-display text-lg font-semibold text-ink">
              {tier.name}
            </h2>
            <p className="mt-1 text-sm text-muted">{tier.tagline}</p>
            <ul className="mt-4 space-y-1.5 text-sm text-ink">
              {tier.features.map((feature) => (
                <li key={feature} className="flex gap-2">
                  <span aria-hidden="true" className="text-forest">
                    +
                  </span>
                  {feature}
                </li>
              ))}
            </ul>
            <button
              type="submit"
              className="mt-5 w-full rounded-md bg-forest px-4 py-2 text-sm font-medium text-surface-elevated transition hover:bg-forest-deep"
            >
              Start free trial
            </button>
          </form>
        ))}
      </div>

      <p className="text-center text-xs text-muted">
        Free for 30 days. Cancel anytime. Pricing is shown on the secure Stripe
        checkout page.
      </p>
    </div>
  );
}
