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
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-sand bg-surface-elevated p-4 transition has-[:checked]:border-forest"
          >
            <input
              type="checkbox"
              name={option.name}
              defaultChecked={defaults[option.name]}
              className="mt-1 h-4 w-4 accent-forest"
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
        className="w-full rounded-md bg-forest px-4 py-2 text-sm font-medium text-surface-elevated transition hover:bg-forest-deep disabled:opacity-60"
      >
        {pending ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}
