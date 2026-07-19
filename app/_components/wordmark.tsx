/**
 * The Prompt2Eat wordmark — the product's logo lockup. "Prompt" + an amber "2"
 * with a soft glow halo + "Eat", set in the display face (identity handoff). The
 * `.p2e-wordmark` treatment lives in globals.css so the halo + reduced-motion
 * handling stay in one place.
 *
 * Presentational only (no hooks) so it renders in server and client trees alike.
 * The amber "2" is the app's one sanctioned amber-on-chrome brand touchpoint —
 * it's the identity mark, not a functional accent, so it doesn't violate the
 * amber-for-AI firewall.
 *
 *   <Wordmark />                    → static mark, inherits font-size/color
 *   <Wordmark glow />               → the "2" halo pulses (p2e-glow)
 *   <Wordmark className="text-xl" /> → size/colour via utilities on the text
 */
export function Wordmark({
  glow = false,
  className,
}: {
  /** Pulse the amber "2" halo (for AI/brand-moment surfaces). */
  glow?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`p2e-wordmark${glow ? " glow" : ""}${className ? ` ${className}` : ""}`}
      // The visible glyphs already spell the name; expose it cleanly to AT.
      role="img"
      aria-label="Prompt2Eat"
    >
      <span aria-hidden="true">
        Prompt<span className="two">2</span>Eat
      </span>
    </span>
  );
}

/**
 * The Prompt2Eat brand mark — the icon half of the identity: an amber crescent
 * with a cream sparkle on a forest tile (same art as the favicon,
 * public/p2e-icon.svg). Inline SVG so it inherits crispness at any size and
 * needs no network fetch; self-contained (no <mask>/ids) so it's safe to render
 * many times on a page. Size it via `className` (e.g. "h-7 w-7").
 *
 * The sparkle is the product identity mark, not a functional accent — like the
 * wordmark's amber "2", it's a sanctioned brand touchpoint, not an AI signal.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="Prompt2Eat"
    >
      <rect width="64" height="64" rx="15" fill="#16241C" />
      <circle cx="29" cy="35" r="18" fill="#F4B43C" />
      <circle cx="40" cy="27" r="16.5" fill="#16241C" />
      <path
        d="M45 13 Q45 23 55 23 Q45 23 45 33 Q45 23 35 23 Q45 23 45 13 Z"
        fill="#FBF8F1"
      />
    </svg>
  );
}
