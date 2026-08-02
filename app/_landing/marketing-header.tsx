import Link from "next/link";

import { BrandMark, Wordmark } from "@/app/_components/wordmark";
import { cx } from "@/app/_components/cx";

/**
 * The slim dark nav shared by the marketing routes — /learn, /learn/[slug],
 * /shop and /for/[segment] (audit D4).
 *
 * All four had written the same sticky header, the same brand block and the
 * same trailing link by hand. Only two things ever varied: the container width
 * and which links follow. Everything else was four copies of one design, which
 * is how three of them ended up with the same "← Back" literal and the fourth
 * with a subtly different one.
 *
 * Deliberately NOT built on `buttonStyles` / `denseButtonStyles`. This is the
 * marketing surface: a dark forest bar with its own type scale (13.5px), its own
 * radii (9px / 11px) and hover states tuned for that background. The owner
 * design system is a different surface with different constraints, and forcing
 * one onto the other would flatten a deliberate distinction rather than remove a
 * duplication.
 */

/** Trailing text link — "← Back to home", "← All guides". */
const backLink =
  "ml-auto rounded-[9px] px-3 py-1.5 text-[13.5px] font-semibold " +
  "text-[#C9D4CB] transition hover:bg-[rgba(247,243,234,0.08)] hover:text-surface";

/** Amber "Start free" CTA. Marketing is a sanctioned amber surface. */
const ctaLink =
  "rounded-[11px] bg-[var(--color-accent)] px-4 py-1.5 text-[13.5px] " +
  "font-bold text-forest transition hover:-translate-y-0.5";

export type MarketingHeaderProps = {
  /** The page's container class — widths differ per route (760–1240px). */
  container: string;
  /** Optional trailing text link. */
  back?: { href: string; label: string };
  /** Renders the "Start free" CTA when set. */
  cta?: boolean;
};

export function MarketingHeader({ container, back, cta }: MarketingHeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-[rgba(247,243,234,0.08)] bg-[rgba(15,36,27,0.92)] backdrop-blur-[14px]">
      <nav className={cx(container, "flex items-center gap-4 py-3")}>
        <Link href="/" className="flex items-center gap-2">
          <BrandMark className="h-[30px] w-[30px] shrink-0 rounded-lg" />
          <Wordmark className="text-[21px] text-surface" />
        </Link>
        {back ? (
          <Link href={back.href} className={backLink}>
            {back.label}
          </Link>
        ) : null}
        {cta ? (
          // ml-auto here only when there is no back link to carry it, so the
          // CTA still pins right on /for/[segment], which has no back link.
          <Link href="/signin" className={cx(back ? null : "ml-auto", ctaLink)}>
            Start free
          </Link>
        ) : null}
      </nav>
    </header>
  );
}
