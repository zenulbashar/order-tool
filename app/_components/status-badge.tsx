import type { ReactNode } from "react";

import { cx } from "./cx";

/** Kitchen order-progress tones (orders dashboard — Step 7). */
export type KitchenTone = "new" | "preparing" | "ready" | "done" | "late";
/** Payment / order-state tones (order confirmation + customer history — 2b). */
export type PaymentTone = "paid" | "processing" | "failed" | "cancelled";
export type StatusTone = KitchenTone | PaymentTone;

/**
 * Tone → semantic token, replacing the raw blue/green/amber/gray currently
 * scattered across order-card / order-history. "new"/"preparing"/"processing"
 * are the sanctioned amber status tones (product signature, not a functional
 * control); success → "ready"/"paid", terracotta → "late"/"failed", muted →
 * "done"/"cancelled". Pure display → server-safe.
 */
const toneStyles: Record<StatusTone, string> = {
  new: "bg-accent text-forest",
  preparing: "bg-[var(--color-accent)]/15 text-accent-deep",
  ready: "bg-[var(--color-success)]/15 text-success-deep",
  done: "bg-sand text-muted",
  late: "bg-[var(--color-warm-deep)] text-white",
  paid: "bg-[var(--color-success)]/15 text-success-deep",
  processing: "bg-[var(--color-accent)]/15 text-accent-deep",
  failed: "bg-[var(--color-warm)]/15 text-warm-deep",
  cancelled: "bg-sand text-muted",
};

const toneLabel: Record<StatusTone, string> = {
  new: "New",
  preparing: "Preparing",
  ready: "Ready",
  done: "Done",
  late: "Late",
  paid: "Paid",
  processing: "Processing",
  failed: "Not completed",
  cancelled: "Cancelled",
};

export type StatusBadgeProps = {
  tone: StatusTone;
  /** Overrides the default label text for the tone. */
  children?: ReactNode;
  className?: string;
};

export function StatusBadge({ tone, children, className }: StatusBadgeProps) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-sm px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide",
        toneStyles[tone],
        className,
      )}
    >
      {children ?? toneLabel[tone]}
    </span>
  );
}
