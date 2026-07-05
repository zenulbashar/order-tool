"use client";

import { useTransition } from "react";

import { cx } from "@/app/_components/cx";

import { setPushNewOrders } from "./actions";

/**
 * New-order push toggle (quick-win #5). Native form-submit toggle (no controlled
 * input): clicking posts setPushNewOrders with the FLIPPED value. Forest fill
 * when on — an operational control, not an AI surface.
 */
export function NotifyToggle({ enabled }: { enabled: boolean }) {
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          await setPushNewOrders(formData);
        })
      }
    >
      <input type="hidden" name="enable" value={enabled ? "off" : "on"} />
      <button
        type="submit"
        role="switch"
        aria-checked={enabled}
        aria-label="New-order push notifications"
        disabled={isPending}
        className="flex items-center gap-2.5 text-sm font-semibold text-ink disabled:opacity-60"
      >
        <span
          className={cx(
            "relative h-6 w-10 shrink-0 rounded-pill transition-colors",
            enabled ? "bg-forest" : "bg-line",
          )}
        >
          <span
            className={cx(
              "absolute top-0.5 h-5 w-5 rounded-full bg-surface-elevated shadow-sm transition-all",
              enabled ? "right-0.5" : "left-0.5",
            )}
          />
        </span>
        {enabled ? "On" : "Off"}
      </button>
    </form>
  );
}
