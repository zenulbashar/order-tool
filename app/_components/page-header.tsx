import Link from "next/link";
import type { ReactNode } from "react";

import { cx } from "./cx";

export type PageHeaderProps = {
  title: ReactNode;
  /**
   * When present, renders a "← Back" link. NAV-AGNOSTIC: hub-and-spoke pages
   * pass it; a future sidebar shell omits it. Build for both, assume neither.
   */
  backHref?: string;
  description?: ReactNode;
  /** Right-aligned action slot (e.g. a Button). */
  action?: ReactNode;
  className?: string;
};

/**
 * The per-page header every owner subpage hand-rolls: optional back-link, title,
 * optional description, optional right-aligned action. Presentational, no hooks
 * → server-safe. Domain-agnostic: functional accents read var(--action) (forest
 * on the owner root) over the neutral cream/ink/muted tokens.
 */
export function PageHeader({
  title,
  backHref,
  description,
  action,
  className,
}: PageHeaderProps) {
  return (
    <header // lg:px-8 so the header aligns with the content rhythm on large monitors,
      // where pages run to max-w-[1600px] but this stayed at px-5.
      className={cx("border-b border-line px-5 py-5 lg:px-8", className)}>
      {backHref ? (
        <Link
          href={backHref}
          className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--action)] transition hover:opacity-80"
        >
          ← Back
        </Link>
      ) : null}
      {/* Stacks below sm: the title had ~180px beside a shrink-0 action slot at
          360–390px and broke to two or three lines (UI audit P1-6). */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 text-sm text-muted">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </header>
  );
}
