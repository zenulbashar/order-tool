"use client";

import { useRef, type KeyboardEvent } from "react";

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
 *
 * Implements the WAI-ARIA radiogroup keyboard model to match the announced
 * roles: a single Tab stop (roving tabindex — only the checked segment is
 * tabbable) and Arrow/Home/End keys move selection between segments. Click and
 * Enter/Space still work (native buttons).
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: SegmentedProps<T>) {
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const activeIndex = options.findIndex((option) => option.value === value);
  // When value matches nothing, keep the group tab-reachable via the first item.
  const rovingIndex = activeIndex >= 0 ? activeIndex : 0;

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        nextIndex = (index + 1) % options.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        nextIndex = (index - 1 + options.length) % options.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = options.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    onChange(options[nextIndex].value);
    buttonsRef.current[nextIndex]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx(
        "inline-flex rounded-pill border border-line bg-surface p-1",
        className,
      )}
    >
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              buttonsRef.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={index === rovingIndex ? 0 : -1}
            onKeyDown={(event) => handleKeyDown(event, index)}
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
