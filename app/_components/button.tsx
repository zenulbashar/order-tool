"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

import { ButtonLabel, Spinner } from "./spinner";
import {
  type ButtonSize,
  type ButtonVariant,
  buttonStyles,
} from "./button-variants";
import { cx } from "./cx";

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Fully rounded (pill) instead of the default control radius. */
  pill?: boolean;
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  CommonProps & {
    /** While true the button is disabled and shows the shared Spinner. */
    loading?: boolean;
    /** Accessible/visible label shown beside the spinner while loading. */
    loadingLabel?: string;
    children: ReactNode;
  };

/**
 * Shared button primitive. Presentational only — it forwards every native
 * <button> prop (type, disabled, onClick, …) and never owns behaviour. Primary
 * fill is var(--action); the loading state reuses the shared <Spinner> via
 * <ButtonLabel> (Spinner inherits colour from text via bg-current, so it reads
 * correctly on every variant).
 */
export function Button({
  variant = "secondary",
  size = "md",
  pill = false,
  loading = false,
  loadingLabel = "Loading",
  disabled,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonStyles(variant, size, { pill, className })}
      {...rest}
    >
      <ButtonLabel pending={loading} pendingLabel={loadingLabel}>
        {children}
      </ButtonLabel>
    </button>
  );
}

const iconSizeStyles: Record<ButtonSize, string> = {
  sm: "h-9 w-9", // 36px
  md: "h-11 w-11", // 44px — touch-target floor
  lg: "h-12 w-12", // 48px
};

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  CommonProps & {
    /** Required — icon-only buttons have no visible text label. */
    "aria-label": string;
    loading?: boolean;
    children: ReactNode;
  };

/**
 * Square icon-only button. Same variants/accent as Button but fixed to a
 * square ≥44px (md+) touch target; an aria-label is required by the type.
 */
export function IconButton({
  variant = "ghost",
  size = "md",
  pill = false,
  loading = false,
  disabled,
  className,
  children,
  type = "button",
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        buttonStyles(variant, size, { pill, className }),
        // Override the horizontal padding from buttonStyles with a square box.
        "px-0",
        iconSizeStyles[size],
      )}
      {...rest}
    >
      {loading ? <Spinner size="sm" /> : children}
    </button>
  );
}
