"use client";

import { cx } from "./cx";

export type StepperProps = {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  /** Used to build the buttons' accessible labels + group label. */
  label?: string;
  className?: string;
};

const stepButton =
  "flex h-11 w-11 items-center justify-center rounded-control border border-line " +
  "text-lg leading-none text-[var(--action)] transition hover:bg-sand " +
  "disabled:cursor-not-allowed disabled:opacity-40";

/**
 * Quantity stepper (−/value/+). Controlled — the consumer owns `value`.
 * Buttons are 44px (fixes the current 28px steppers); the value is announced
 * via an aria-live region. The accent glyph reads var(--action).
 */
export function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled,
  label = "Quantity",
  className,
}: StepperProps) {
  const atMin = min !== undefined && value <= min;
  const atMax = max !== undefined && value >= max;
  const noun = label.toLowerCase();

  return (
    <div
      role="group"
      aria-label={label}
      className={cx("inline-flex items-center gap-1", className)}
    >
      <button
        type="button"
        aria-label={`Decrease ${noun}`}
        disabled={disabled || atMin}
        onClick={() => onChange(value - step)}
        className={stepButton}
      >
        −
      </button>
      <span
        aria-live="polite"
        className="min-w-8 text-center text-sm font-medium tabular-nums text-ink"
      >
        {value}
      </span>
      <button
        type="button"
        aria-label={`Increase ${noun}`}
        disabled={disabled || atMax}
        onClick={() => onChange(value + step)}
        className={stepButton}
      >
        +
      </button>
    </div>
  );
}
