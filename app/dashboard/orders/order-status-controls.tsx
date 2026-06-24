"use client";

import { useState, useTransition } from "react";

import { updateOrderFulfillmentStatus } from "./actions";
import type { FulfillmentStatus } from "./queries";

// new -> preparing -> ready -> completed is the common forward path, but every
// status is selectable (un-opinionated), so an owner can also step one back.
const STEPS: { value: FulfillmentStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "preparing", label: "Preparing" },
  { value: "ready", label: "Ready" },
  { value: "completed", label: "Completed" },
];

export function OrderStatusControls({
  orderId,
  status,
}: {
  orderId: string;
  status: FulfillmentStatus;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {STEPS.map((step) => {
        const isCurrent = step.value === status;
        return (
          <button
            key={step.value}
            type="button"
            // The current status is a no-op; disable it (and all buttons while a
            // change is in flight, to prevent double-submits).
            disabled={isPending || isCurrent}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const result = await updateOrderFulfillmentStatus(
                  orderId,
                  step.value,
                );
                if (result?.error) setError(result.error);
              });
            }}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed ${
              isCurrent
                ? "bg-gray-900 text-white disabled:opacity-100"
                : "border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            }`}
          >
            {step.label}
          </button>
        );
      })}
      {error ? (
        <p className="w-full text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
