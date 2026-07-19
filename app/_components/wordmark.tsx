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
 * The Prompt2Eat brand mark — the icon half of the identity: an amber leaf whose
 * tip carries a four-point AI spark, on a forest tile. Vector art from the brand
 * logo kit (identical to the favicon, public/favicon.svg), inlined so it stays
 * crisp at any size with no network fetch. Self-contained (a forest tile), so it
 * reads on both light and forest-dark chrome. Size it via `className` ("h-7 w-7").
 *
 * The mark is the product identity, not a functional accent — like the wordmark's
 * amber "2", it's a sanctioned brand touchpoint, not an AI signal.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 72 72"
      className={className}
      role="img"
      aria-label="Prompt2Eat"
    >
      <rect width="72" height="72" rx="16" fill="#16241C" />
      <g transform="translate(0,7)">
        <rect
          x="5.5"
          y="49.5"
          width="10"
          height="5.4"
          rx="2.7"
          transform="rotate(43 12 52)"
          fill="#B97714"
        />
        <path
          d="M12 52 A 35 35 0 0 1 56 15 A 21.5 21.5 0 0 0 12 52 Z"
          fill="#F4B43C"
        />
        <path
          d="M15 49.5 A 27 27 0 0 1 47.5 19.5"
          stroke="#B97714"
          strokeWidth="2.4"
          strokeLinecap="round"
          fill="none"
          opacity="0.33"
        />
        <path d="M57 5 L61 14 L57 23 L53 14 Z" fill="#F7F3EA" />
        <path d="M48 14 L57 10 L66 14 L57 18 Z" fill="#F7F3EA" />
      </g>
    </svg>
  );
}
