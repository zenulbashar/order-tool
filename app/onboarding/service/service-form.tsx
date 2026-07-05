"use client";

import { useActionState } from "react";

import { saveServiceStyle, type ServiceState } from "./actions";

const initialState: ServiceState = {};

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
  {
    name: "offersDelivery",
    title: "Delivery",
    description: "You deliver orders to the customer.",
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
      </div>

      {state.error ? (
        <p className="text-sm text-error" role="alert">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="flex w-full items-center justify-center gap-1.5 rounded-control bg-forest px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Continue"}
        {pending ? null : (
          <span aria-hidden="true" className="text-[var(--color-accent)]">→</span>
        )}
      </button>
    </form>
  );
}
