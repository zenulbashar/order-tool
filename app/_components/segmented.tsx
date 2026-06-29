"use client";

import { cx } from "./cx";

export type SegmentedOption<T extends string> = {
  label: string;
  value: T;
};

export type SegmentedProps<T extends string> = {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
  /** Accessible name for the group (role="radiogroup"). */
  label?: string;
  className?: string;
};

/**
 * Segmented control (e.g. Dine-in / Takeaway / Delivery). role="radiogroup"
 * with role="radio" segments; the active segment fills var(--action) on
 * var(--action-contrast). Controlled — the consumer owns `value`.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx(
        "inline-flex rounded-pill border border-line bg-surface p-1",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cx(
              "rounded-pill px-4 py-1.5 text-sm font-medium transition",
              active
                ? "bg-[var(--action)] text-[var(--action-contrast)]"
                : "text-muted hover:text-ink",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
