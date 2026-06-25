/**
 * App-wide loading indicator: a tasteful three-dot pulse.
 *
 * Presentational only (no hooks), so it renders in both server and client
 * trees. Colour is inherited via `bg-current`, so dropping it inside a button
 * or coloured text "just works" — on a dark/brand button it shows white dots,
 * on light text it shows grey. The keyframe lives in globals.css
 * (`order-loading-dot`) and respects prefers-reduced-motion.
 *
 * Used wherever an async action is in flight (photo upload, AI import, checkout,
 * kitchen status, menu CRUD saves) so the whole app shares one loading look.
 */

const DOT_SIZE = {
  sm: "h-1 w-1",
  md: "h-1.5 w-1.5",
} as const;

export function Spinner({
  size = "md",
  className,
  label = "Loading",
}: {
  size?: keyof typeof DOT_SIZE;
  className?: string;
  /** Accessible status label; visually hidden. */
  label?: string;
}) {
  return (
    <span
      role="status"
      aria-label={label}
      className={`inline-flex items-center gap-1 ${className ?? ""}`}
    >
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className={`order-loading-dot ${DOT_SIZE[size]} rounded-full bg-current`}
          style={{
            animation: "order-loading-dot 1.2s infinite ease-in-out both",
            // Negative stagger so the three dots are out of phase immediately.
            animationDelay: `${index * 0.16 - 0.32}s`,
          }}
        />
      ))}
    </span>
  );
}

/**
 * Convenience wrapper for buttons: shows the spinner alongside a label while
 * `pending`, or the idle children otherwise. Keeps button markup tidy at the
 * many call sites that follow the `{pending ? "…" : "…"}` pattern.
 */
export function ButtonLabel({
  pending,
  pendingLabel,
  children,
}: {
  pending: boolean;
  pendingLabel: string;
  children: React.ReactNode;
}) {
  if (!pending) return <>{children}</>;
  return (
    <span className="inline-flex items-center gap-2">
      <Spinner size="sm" />
      {pendingLabel}
    </span>
  );
}
