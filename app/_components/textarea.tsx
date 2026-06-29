"use client";

import type { TextareaHTMLAttributes } from "react";

import { controlClass } from "./field";
import { cx } from "./cx";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean;
};

/**
 * Multiline text input. Same control recipe/states as Input
 * (default / focus / filled / error / disabled). Presentational only.
 */
export function Textarea({ invalid, className, ...rest }: TextareaProps) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={controlClass({ invalid, className: cx("min-h-24 py-2", className) })}
      {...rest}
    />
  );
}
