"use client";

import type { SelectHTMLAttributes } from "react";

import { controlClass } from "./field";
import { cx } from "./cx";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  invalid?: boolean;
};

/**
 * Native select with the shared control recipe and a chevron affordance. Same
 * states as Input (default / focus / filled / error / disabled). The chevron is
 * a decorative background; appearance-none hides the native arrow.
 */
export function Select({ invalid, className, children, ...rest }: SelectProps) {
  return (
    <div className="relative">
      <select
        aria-invalid={invalid || undefined}
        className={controlClass({
          invalid,
          className: cx("appearance-none pr-9", className),
        })}
        {...rest}
      >
        {children}
      </select>
      <span
        className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted"
        aria-hidden="true"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </div>
  );
}
