import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

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
    "w-full rounded-input border bg-surface-elevated px-3 py-2 text-sm text-ink shadow-sm",
    "placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-60",
    "read-only:bg-sand/40 focus-visible:outline-none",
    // Focus = amber border + subtle amber glow (export); the invalid state keeps
    // the warm border and shows the red ring instead.
    opts?.invalid
      ? "border-[var(--color-warm)] focus-visible:shadow-[var(--focus-ring-danger)]"
      : "border-line focus-visible:border-[var(--color-accent)] focus-visible:shadow-[var(--focus-ring-input)]",
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
 *
 * Accessibility: when `htmlFor` is set, the hint/error `<p>` is given a matching
 * id and the wrapped control is programmatically linked to it via
 * `aria-describedby` (and `aria-invalid` when there's an error) — so a screen
 * reader announces the message whenever focus returns to the field, not only the
 * once role="alert" fires. Done by cloning the single child, so it stays
 * hook-free and server-safe.
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
  // Deterministic id derived from htmlFor (no useId → keeps Field server-safe).
  const messageId = htmlFor
    ? error
      ? `${htmlFor}-error`
      : hint
        ? `${htmlFor}-hint`
        : undefined
    : undefined;

  let control = children;
  if (isValidElement(children) && (messageId || error)) {
    const child = children as ReactElement<Record<string, unknown>>;
    const existingDescribedBy = child.props["aria-describedby"];
    control = cloneElement(child, {
      "aria-describedby":
        [existingDescribedBy, messageId].filter(Boolean).join(" ") || undefined,
      "aria-invalid": error ? true : child.props["aria-invalid"],
    });
  }

  return (
    <div className={cx("space-y-1.5", className)}>
      {label ? (
        <Label htmlFor={htmlFor} required={required}>
          {label}
        </Label>
      ) : null}
      {control}
      {error ? (
        <p
          id={messageId}
          className="text-xs text-[var(--color-warm)]"
          role="alert"
        >
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
