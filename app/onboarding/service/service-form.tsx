"use client";

import { useActionState } from "react";
import { wizardSubmitButton } from "../wizard-button";

import { saveServiceStyle, type ServiceState } from "./actions";

const initialState: ServiceState = {};

// Only the modes the ordering domain can actually fulfil (order_type is
// pickup | dine_in). Delivery is shown below as a disabled "coming soon" tile —
// never as a selectable mode — so a merchant can't complete onboarding into a
// storefront that can take zero orders.
const OPTIONS = [
  {
    name: "offersDineIn",
    title: "Dine-in (QR)",
    description: "Guests scan a table QR code and order from their seat.",
  },
  {
    name: "offersTakeaway",
    title: "Takeaway / pickup",
    description: "Customers order ahead and collect from the counter.",
  },
] as const;

type Defaults = {
  offersDineIn: boolean;
  offersTakeaway: boolean;
  offersDelivery: boolean;
};

export function ServiceForm({ defaults }: { defaults: Defaults }) {
  const [state, formAction, pending] = useActionState(
    saveServiceStyle,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-3">
        {OPTIONS.map((option) => (
          <label
            key={option.name}
            className="flex cursor-pointer items-start gap-3 rounded-card border border-line bg-surface-elevated p-4 transition hover:bg-hover-secondary has-[:checked]:border-[var(--color-accent)] has-[:checked]:bg-[var(--color-accent)]/8"
          >
            <input
              type="checkbox"
              name={option.name}
              defaultChecked={defaults[option.name]}
              className="mt-1 h-4 w-4 accent-[var(--color-accent)]"
            />
            <span className="space-y-0.5">
              <span className="block text-sm font-medium text-ink">
                {option.title}
              </span>
              <span className="block text-sm text-muted">
                {option.description}
              </span>
            </span>
          </label>
        ))}

        {/* Delivery can't be offered yet — the ordering flow has no delivery
            fulfilment. A disabled tile keeps the roadmap visible without letting
            a merchant onboard onto a mode that can't take orders. */}
        <div className="flex items-start gap-3 rounded-card border border-dashed border-line bg-surface-elevated p-4 opacity-60">
          <input
            type="checkbox"
            disabled
            aria-describedby="delivery-coming-soon"
            className="mt-1 h-4 w-4"
          />
          <span className="space-y-0.5">
            <span className="block text-sm font-medium text-ink">
              Delivery
              <span className="ml-2 rounded-full border border-line px-2 py-0.5 text-xs font-normal text-muted">
                Coming soon
              </span>
            </span>
            <span id="delivery-coming-soon" className="block text-sm text-muted">
              Delivery ordering isn&apos;t available yet — we&apos;ll let you
              know when you can switch it on.
            </span>
          </span>
        </div>
      </div>

      {state.error ? (
        <p className="text-sm text-error" role="alert">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className={wizardSubmitButton}
      >
        {pending ? "Saving…" : "Continue"}
        {pending ? null : (
          <span aria-hidden="true" className="text-[var(--color-accent)]">→</span>
        )}
      </button>
    </form>
  );
}
