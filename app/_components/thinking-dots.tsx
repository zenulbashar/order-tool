/**
 * AI "thinking / processing" indicator — three amber dots bouncing on the
 * shared `p2e-think` keyframe, with an optional trailing message (e.g.
 * "Reading your menu…", "Drafting descriptions…").
 *
 * Distinct from <Spinner>: Spinner is the neutral, colour-inheriting loader for
 * buttons and inline async (it uses the subtler `order-loading-dot` keyframe).
 * ThinkingDots is the AMBER product/AI affordance — it signals "the AI is
 * working", matching the sanctioned amber used on Suggest description / Read
 * menu / Draft descriptions. Use it for AI generation waits, not generic spinners.
 *
 * Presentational only (no hooks, no state) → server-safe, renders in both server
 * and client trees exactly like Card/PageHeader; no "use client" boundary needed.
 *
 * Motion: each dot carries the global `.p2e-think` utility (from globals.css),
 * which is already inside the prefers-reduced-motion guard there — so a
 * reduced-motion user sees three static amber dots (animation: none !important),
 * no bounce, with the optional label still legible. Nothing extra to wire.
 *
 * Colour: amber via var(--color-accent). This reads correctly on cream surfaces
 * and on the forest/concierge dark card (amber-on-forest is the existing
 * concierge accent), so no surface/tone variant is needed yet; add one only when
 * a non-amber context actually appears.
 */

// Per-dot bounce offset so the three dots are out of phase (matches the design
// source's 0 / 160 / 320ms rhythm on the 1.2s p2e-think cycle).
const DOT_DELAYS_S = [0, 0.16, 0.32];

export function ThinkingDots({
  label,
  className,
}: {
  /** Optional accompanying message rendered after the dots (e.g. "Reading…"). */
  label?: string;
  className?: string;
}) {
  return (
    <span
      role="status"
      // With a visible label the text is the accessible name; without one, give
      // screen readers something to announce.
      aria-label={label ? undefined : "Working"}
      className={`inline-flex items-center gap-2 ${className ?? ""}`}
    >
      <span aria-hidden="true" className="inline-flex items-center gap-1">
        {DOT_DELAYS_S.map((delay, index) => (
          <span
            key={index}
            className="p2e-think h-2 w-2 rounded-full bg-[var(--color-accent)]"
            style={{ animationDelay: `${delay}s` }}
          />
        ))}
      </span>
      {label ? (
        <span className="text-sm font-medium text-muted">{label}</span>
      ) : null}
    </span>
  );
}
