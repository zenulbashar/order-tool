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
