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
  "transition motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-60";

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-xs", // 36px — compact, secondary use
  md: "h-11 px-4 text-sm", // 44px — meets the touch-target floor
  lg: "h-12 px-5 text-base", // 48px
};

// Per-size radius (export: sm 9 / md 11 / lg 13).
const radiusStyles: Record<ButtonSize, string> = {
  sm: "rounded-control-sm",
  md: "rounded-control",
  lg: "rounded-control-lg",
};

// Hover = a 1px lift + soft shadow (export). Fills stay var(--action) (owner
// forest / diner brand); amber never appears here — it's AI-fills-only.
const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--action)] text-[var(--action-contrast)] hover:-translate-y-px hover:shadow-lift",
  secondary:
    "border border-line-strong bg-surface-elevated text-ink hover:-translate-y-px hover:bg-hover-secondary hover:shadow-lift",
  ghost: "text-ink hover:bg-hover-ghost",
  // Deep terracotta so white label clears AA (white on #cf4527 ≈ 4.63:1); hover
  // darkens (never lightens) to keep the label readable. Red focus ring per the
  // export, overriding the global amber ring for destructive intent.
  destructive:
    "bg-[var(--color-warm-deep)] text-white hover:-translate-y-px hover:brightness-90 hover:shadow-lift-danger focus-visible:shadow-[var(--focus-ring-danger)]",
};

/**
 * Circular icon-only button — quantity steppers, close affordances. 44px by
 * default, which is the touch-target floor for a control with no text label to
 * widen it (audit D4; three hand-written copies).
 *
 * Icon buttons cannot go through `buttonStyles`: it has no square size, and its
 * `px-*` sizing would stretch a glyph-only button into a lozenge.
 */
export function iconButtonStyles(opts?: {
  /** 44px (default) or the 40px used inside dense drawers. */
  size?: "md" | "sm";
  className?: string;
}): string {
  return cx(
    "flex items-center justify-center rounded-pill",
    opts?.size === "sm" ? "h-10 w-10" : "h-11 w-11",
    "text-muted transition hover:bg-sand hover:text-ink",
    opts?.className,
  );
}

/**
 * Ink-filled pill for confirm-style submits that are deliberately NOT the
 * page's var(--action) colour — refund confirmation, staff invite send. The ink
 * fill reads as "commit this" without competing with the surface's own accent.
 */
export const inkPillStyles =
  "rounded-pill bg-ink px-4 py-2 text-sm font-semibold text-surface " +
  "transition disabled:opacity-60";

/**
 * The dense row-action button used in admin tables and dense owner lists
 * ("Pause", "Edit", "View venue", "Mark done"). Eleven copies of this had been
 * written by hand and two had already DRIFTED to `font-semibold` (audit D4).
 *
 * Deliberately NOT a `buttonStyles` size. buttonStyles sizes by HEIGHT — the
 * smallest is `h-9` (36px), to hold the touch-target floor for a standalone
 * control. These sit inline in table rows at roughly 26px and are secondary to a
 * row that is itself the target; adopting `h-9` would grow every admin table row
 * by ~10px. Encoding that as a fake buttonStyles size would misrepresent the
 * constraint, so it is its own recipe with its own reason.
 */
export function denseButtonStyles(opts?: {
  /** Outline (default) or a filled var(--action) button. */
  variant?: "outline" | "solid";
  /** sm = px-3 py-1.5 (default); xs = px-2.5 py-1 for the densest tables. */
  size?: "xs" | "sm";
  /**
   * Padding override, REPLACING the size's. Same reason `controlClass` has one:
   * `cx` is a plain joiner, not tailwind-merge, so passing padding through
   * `className` emits it alongside the size's and leaves stylesheet order to
   * pick a winner. One call site wants px-3 py-1 — neither size's pair.
   */
  padding?: string;
  /** Adds bg-surface-elevated, for rows that sit on a tinted background. */
  elevated?: boolean;
  /** Adds inline-flex + gap, for buttons carrying a leading glyph. */
  withIcon?: boolean;
  className?: string;
}): string {
  const solid = opts?.variant === "solid";
  return cx(
    opts?.withIcon ? "inline-flex items-center gap-1.5" : null,
    "rounded-control",
    opts?.padding ?? (opts?.size === "xs" ? "px-2.5 py-1" : "px-3 py-1.5"),
    "text-xs font-bold transition",
    solid
      ? "bg-[var(--action)] text-white hover:opacity-90"
      : "border border-line-strong text-ink hover:bg-hover-secondary",
    !solid && opts?.elevated ? "bg-surface-elevated" : null,
    opts?.className,
  );
}

/** Build the class string for a button-styled element. */
export function buttonStyles(
  variant: ButtonVariant = "secondary",
  size: ButtonSize = "md",
  options?: { pill?: boolean; className?: string },
): string {
  return cx(
    base,
    options?.pill ? "rounded-pill" : radiusStyles[size],
    sizeStyles[size],
    variantStyles[variant],
    options?.className,
  );
}
