import type { ReactNode } from "react";

import { cx } from "./cx";

/**
 * Shared control recipe for Input / Textarea / Select. Pure (no React, no
 * "use client") so the client field components can import it freely. Focus uses
 * a border recolour on :focus-visible (keyboard only) — it complements, never
 * fights, the global :where(...):focus-visible outline from Step 0.
 */
export function controlClass(opts?: {
  invalid?: boolean;
  className?: string;
}): string {
  return cx(
    "w-full rounded-control border bg-surface-elevated px-3 py-2 text-sm text-ink shadow-sm",
    "placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-60",
    "read-only:bg-sand/40",
    "focus-visible:border-[var(--action)]",
    opts?.invalid ? "border-[var(--color-warm)]" : "border-line",
    opts?.className,
  );
}

export type LabelProps = {
  htmlFor?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
};

/** Form label. Pure display → server-safe. */
export function Label({ htmlFor, required, children, className }: LabelProps) {
  return (
    <label
      htmlFor={htmlFor}
      className={cx("block text-sm font-medium text-ink", className)}
    >
      {children}
      {required ? (
        <span className="text-[var(--color-warm)]" aria-hidden="true">
          {" "}
          *
        </span>
      ) : null}
    </label>
  );
}

export type FieldProps = {
  label?: ReactNode;
  /** id of the control this field wraps, so the label's htmlFor lines up. */
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
};

/**
 * Label + control slot + hint/error scaffolding. Error supersedes hint and is
 * announced via role="alert". Pure display → server-safe. Consolidates the
 * label/hint/error markup duplicated around the inline fieldClass call sites.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: FieldProps) {
  return (
    <div className={cx("space-y-1.5", className)}>
      {label ? (
        <Label htmlFor={htmlFor} required={required}>
          {label}
        </Label>
      ) : null}
      {children}
      {error ? (
        <p className="text-xs text-[var(--color-warm)]" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
