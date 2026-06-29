"use client";

import { useState, useTransition } from "react";

import { Button } from "@/app/_components/button";

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
  const [target, setTarget] = useState<FulfillmentStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {STEPS.map((step) => {
        const isCurrent = step.value === status;
        const isTarget = isPending && target === step.value;
        return (
          <Button
            key={step.value}
            type="button"
            size="sm"
            variant={isCurrent ? "primary" : "secondary"}
            // The current status is a no-op; disable it (and all buttons while a
            // change is in flight, to prevent double-submits).
            disabled={isPending || isCurrent}
            // Spinner only on the button being clicked, not all of them.
            loading={isTarget && isPending}
            loadingLabel={step.label}
            onClick={() => {
              setError(null);
              setTarget(step.value);
              startTransition(async () => {
                const result = await updateOrderFulfillmentStatus(
                  orderId,
                  step.value,
                );
                if (result?.error) setError(result.error);
              });
            }}
          >
            {step.label}
          </Button>
        );
      })}
      {error ? (
        <p className="w-full text-xs text-[var(--color-warm)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
