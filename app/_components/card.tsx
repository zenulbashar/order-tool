import type { HTMLAttributes } from "react";

import { cx } from "./cx";

/**
 * Pure recipe for the reusable owner panel — cream surface, hairline border,
 * card radius. Lives alongside the component (like buttonStyles) so a link-styled
 * card can borrow the class string without rendering a <div>:
 *
 *   <Link className={cardStyles({ interactive: true })}>…</Link>
 *
 * `interactive` adds a NEUTRAL hover affordance only (border + shadow, no
 * colour, no amber) for clickable cards like the dashboard hub tiles.
 */
export function cardStyles(opts?: {
  interactive?: boolean;
  className?: string;
}): string {
  return cx(
    "rounded-card border border-line bg-surface-elevated p-5",
    opts?.interactive &&
      "block transition hover:border-muted/40 hover:shadow-md",
    opts?.className,
  );
}

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** Neutral hover affordance for clickable cards (no colour change). */
  interactive?: boolean;
};

/**
 * Surface panel. Presentational, no hooks → server-safe (usable in the owner
 * server pages and in client trees alike). Domain-agnostic: it uses only the
 * neutral cream/line tokens, so it reads correctly on the owner and diner roots.
 * Compose content as children; for an in-card title use PageHeader-style markup
 * or plain elements — no rigid header sub-API.
 */
export function Card({ interactive, className, ...rest }: CardProps) {
  return <div className={cardStyles({ interactive, className })} {...rest} />;
}
