"use client";

import type { InputHTMLAttributes, ReactNode } from "react";

import { controlClass } from "./field";
import { cx } from "./cx";

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "prefix"> & {
  /** Error styling (terracotta border) + aria-invalid. */
  invalid?: boolean;
  /** Read-only with a lock affordance (covers the export's "locked" state). */
  locked?: boolean;
  /** Inline leading content, e.g. a "$" prefix. */
  prefix?: ReactNode;
};

/**
 * Text input. Covers the export Inputs matrix: default / focus / filled /
 * error / disabled / locked / with-prefix. Presentational — forwards all native
 * <input> props; behaviour stays with the consumer.
 */
export function Input({
  invalid,
  locked,
  prefix,
  className,
  disabled,
  readOnly,
  ...rest
}: InputProps) {
  const control = controlClass({
    invalid,
    className: cx(prefix ? "pl-7" : undefined, locked ? "pr-9" : undefined, className),
  });

  if (!prefix && !locked) {
    return (
      <input
        className={control}
        disabled={disabled}
        readOnly={readOnly}
        aria-invalid={invalid || undefined}
        {...rest}
      />
    );
  }

  return (
    <div className="relative">
      {prefix ? (
        <span
          className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted"
          aria-hidden="true"
        >
          {prefix}
        </span>
      ) : null}
      <input
        className={control}
        disabled={disabled}
        readOnly={readOnly || locked}
        aria-invalid={invalid || undefined}
        aria-readonly={locked || undefined}
        {...rest}
      />
      {locked ? (
        <span
          className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted"
          aria-hidden="true"
        >
          <LockIcon />
        </span>
      ) : null}
    </div>
  );
}

export type SearchProps = Omit<InputProps, "type" | "prefix" | "locked"> & {
  /** Renders a clear button when provided (call site clears its own state). */
  onClear?: () => void;
};

/** Search input: type="search", role="search" wrapper, leading icon + clear. */
export function Search({ invalid, onClear, value, className, ...rest }: SearchProps) {
  const showClear = Boolean(onClear) && Boolean(value);
  return (
    <div role="search" className="relative">
      <span
        className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted"
        aria-hidden="true"
      >
        <SearchIcon />
      </span>
      <input
        type="search"
        value={value}
        aria-invalid={invalid || undefined}
        className={controlClass({
          invalid,
          className: cx("pl-9", showClear ? "pr-9" : undefined, className),
        })}
        {...rest}
      />
      {showClear ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={onClear}
          className="absolute inset-y-0 right-2 flex items-center rounded-control px-1 text-muted transition hover:text-ink"
        >
          <ClearIcon />
        </button>
      ) : null}
    </div>
  );
}

/* — small inline icons (decorative; aria-hidden by their wrappers) — */

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" strokeLinecap="round" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
