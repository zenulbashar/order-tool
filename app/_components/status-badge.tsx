import type { ReactNode } from "react";

import { cx } from "./cx";

export type StatusTone = "new" | "preparing" | "ready" | "done" | "late";

/**
 * Tone → semantic token, replacing the raw blue/green/amber/gray currently
 * scattered across order-card / order-history. "new"/"preparing" are the
 * sanctioned amber status tones (product signature, not a functional control);
 * "ready" → success, "late" → deep terracotta (white = 4.63:1, AA), "done" →
 * muted. Pure display → server-safe.
 */
const toneStyles: Record<StatusTone, string> = {
  new: "bg-accent text-forest",
  preparing: "bg-[var(--color-accent)]/15 text-accent-deep",
  ready: "bg-[var(--color-success)]/15 text-success-deep",
  done: "bg-sand text-muted",
  late: "bg-[var(--color-warm-deep)] text-white",
};

const toneLabel: Record<StatusTone, string> = {
  new: "New",
  preparing: "Preparing",
  ready: "Ready",
  done: "Done",
  late: "Late",
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
