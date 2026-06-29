"use client";

import { useEffect, useRef } from "react";
import type { InputHTMLAttributes } from "react";

import { cx } from "./cx";

export type CheckboxProps = InputHTMLAttributes<HTMLInputElement> & {
  /** Renders the mixed/indeterminate state (aria-checked="mixed"). */
  indeterminate?: boolean;
};

/**
 * Native checkbox styled with accent-color = var(--action). Supports the
 * export's checked / empty / mixed states (mixed via `indeterminate`, which sets
 * the DOM property and aria-checked="mixed").
 */
export function Checkbox({ indeterminate, className, ...rest }: CheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate);
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      aria-checked={indeterminate ? "mixed" : undefined}
      className={cx(
        "h-5 w-5 rounded-sm border-line accent-[var(--action)] disabled:opacity-50",
        className,
      )}
      {...rest}
    />
  );
}

export type RadioProps = InputHTMLAttributes<HTMLInputElement>;

/** Native radio styled with accent-color = var(--action). */
export function Radio({ className, ...rest }: RadioProps) {
  return (
    <input
      type="radio"
      className={cx(
        "h-5 w-5 border-line accent-[var(--action)] disabled:opacity-50",
        className,
      )}
      {...rest}
    />
  );
}

export type ToggleProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Accessible name for the switch. */
  label: string;
  className?: string;
};

/**
 * On/off switch. role="switch" with aria-checked; active track = var(--action).
 * The knob slide is reduced-motion-safe (motion-reduce:transition-none).
 */
export function Toggle({ checked, onChange, disabled, label, className }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-pill transition-colors",
        "motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-[var(--action)]" : "bg-sand",
        className,
      )}
    >
      <span
        className={cx(
          "inline-block h-5 w-5 rounded-pill bg-surface-elevated shadow transition-transform",
          "motion-reduce:transition-none",
          checked ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
