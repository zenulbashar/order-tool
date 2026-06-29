import { cx } from "./cx";

/**
 * Pure button style recipe — NO "use client", no React. Lives apart from
 * button.tsx so server components (e.g. a link-styled CTA) can import the class
 * string without pulling the client `Button` across the boundary:
 *
 *   <Link className={buttonStyles("primary", "md")}>Continue</Link>
 *
 * Functional accents read var(--action) (forest on owner roots, the venue
 * --brand on diner roots) paired with var(--action-contrast). Amber
 * (bg-accent/text-accent) is reserved for AI affordances and never appears here.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex select-none items-center justify-center gap-2 font-medium " +
  "transition disabled:cursor-not-allowed disabled:opacity-60";

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-xs", // 36px — compact, secondary use
  md: "h-11 px-4 text-sm", // 44px — meets the touch-target floor
  lg: "h-12 px-5 text-base", // 48px
};

const variantStyles: Record<ButtonVariant, string> = {
  primary: "bg-[var(--action)] text-[var(--action-contrast)] hover:opacity-90",
  secondary: "border border-line bg-surface-elevated text-ink hover:bg-sand",
  ghost: "text-ink hover:bg-sand",
  // Deep terracotta so white label clears AA (white on #cf4527 ≈ 4.63:1); hover
  // darkens (never lightens) to keep the label readable in the hover state.
  destructive:
    "bg-[var(--color-warm-deep)] text-white hover:brightness-90",
};

/** Build the class string for a button-styled element. */
export function buttonStyles(
  variant: ButtonVariant = "secondary",
  size: ButtonSize = "md",
  options?: { pill?: boolean; className?: string },
): string {
  return cx(
    base,
    options?.pill ? "rounded-pill" : "rounded-control",
    sizeStyles[size],
    variantStyles[variant],
    options?.className,
  );
}
