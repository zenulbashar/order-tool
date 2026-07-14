"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/app/_components/button";

import { updateOrderFulfillmentStatus } from "./actions";
import type { FulfillmentStatus } from "./queries";

// Single forward path: new → preparing → ready → completed. Each active status
// exposes ONE primary action (the next step) plus a low-emphasis back-one-step
// correction. Arbitrary multi-jumps (e.g. new → completed) are intentionally
// gone — the kitchen advances one stage at a time and corrects one stage back.
const FORWARD: Record<
  FulfillmentStatus,
  { next: FulfillmentStatus; label: string } | null
> = {
  new: { next: "preparing", label: "Start preparing" },
  preparing: { next: "ready", label: "Mark ready" },
  ready: { next: "completed", label: "Hand off" },
  completed: null,
};

const BACKWARD: Record<
  FulfillmentStatus,
  { prev: FulfillmentStatus; label: string } | null
> = {
  new: null,
  preparing: { prev: "new", label: "Back to new" },
  ready: { prev: "preparing", label: "Back to preparing" },
  completed: { prev: "ready", label: "Back to ready" },
};

export function OrderStatusControls({
  orderId,
  status,
}: {
  orderId: string;
  status: FulfillmentStatus;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [target, setTarget] = useState<FulfillmentStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  // One transition runner shared by the forward + back controls — same
  // mechanics as before (set the target so only the clicked button spins,
  // disable while in flight to prevent double-submits). On success we refresh
  // immediately so the card moves to the right column at once (rather than
  // waiting up to 12s for the next poll) — this is what made a handed-off order
  // look like it "didn't go to Completed".
  const move = (to: FulfillmentStatus) => {
    setError(null);
    setTarget(to);
    startTransition(async () => {
      const result = await updateOrderFulfillmentStatus(orderId, to);
      if (result?.error) setError(result.error);
      else router.refresh();
    });
  };

  const forward = FORWARD[status];
  const backward = BACKWARD[status];

  // Completed cards render no controls (handled compactly by the card); nothing
  // forward and nothing back means there's nothing to show.
  if (!forward && !backward) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {forward ? (
        <Button
          type="button"
          size="sm"
          variant="primary"
          disabled={isPending}
          loading={isPending && target === forward.next}
          loadingLabel={forward.label}
          onClick={() => move(forward.next)}
        >
          {forward.label}
        </Button>
      ) : null}
      {backward ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={isPending}
          loading={isPending && target === backward.prev}
          loadingLabel={backward.label}
          onClick={() => move(backward.prev)}
        >
          ↩ {backward.label}
        </Button>
      ) : null}
      {error ? (
        <p className="w-full text-xs text-[var(--color-warm)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
