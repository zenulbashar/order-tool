"use client";

import { useTransition } from "react";

import { cx } from "@/app/_components/cx";

import { setPayToEnabled } from "./actions";

/**
 * Pay-by-bank (PayTo) on/off toggle. A native form-submit toggle (no controlled
 * input): clicking posts setPayToEnabled with the FLIPPED value. Forest fill
 * when on — never amber (this is a payment control, not an AI surface).
 */
export function PayToToggle({ enabled }: { enabled: boolean }) {
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          await setPayToEnabled(formData);
        })
      }
    >
      {/* Post the opposite of the current state. */}
      <input type="hidden" name="enable" value={enabled ? "off" : "on"} />
      <button
        type="submit"
        role="switch"
        aria-checked={enabled}
        aria-label="Accept pay by bank (PayTo)"
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
