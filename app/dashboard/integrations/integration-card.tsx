import type { ReactNode } from "react";

import { cx } from "@/app/_components/cx";

/**
 * Connector card — the design bundle's "one anatomy, four states" card
 * (P2E-Owner extension). Presentational and server-safe; the page decides
 * each provider's state from venue_integrations. Per the design's own note,
 * "connect is forest, never amber": every functional accent here is ink /
 * `--action`, statuses use the semantic success/warm tones, and amber never
 * appears (integrations are not AI).
 *
 * Track 0 renders `not_connected` (with the connect action disabled until the
 * Square OAuth build ships) and `coming_soon`; the connecting / connected /
 * needs-attention states arrive with live data in the Square build.
 */
export type ConnectorState = "not_connected" | "coming_soon";

export function ConnectorCard({
  name,
  chip,
  description,
  logo,
  state,
  connectLabel,
  connectHint,
}: {
  name: string;
  // Space Mono category chip, e.g. "POS" or "COMING SOON".
  chip: string;
  description: string;
  logo: ReactNode;
  state: ConnectorState;
  // The CTA line for not_connected; rendered disabled until OAuth ships.
  connectLabel?: string;
  connectHint?: string;
}) {
  const comingSoon = state === "coming_soon";
  return (
    <div
      className={cx(
        "flex flex-col gap-2.5 rounded-card border border-line p-4",
        comingSoon
          ? "bg-hover-secondary"
          : "bg-surface-elevated shadow-card",
      )}
    >
      <div className="flex items-start gap-2.5">
        <div
          className={cx(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px]",
            comingSoon
              ? "bg-sand font-display text-base font-extrabold text-label"
              : "bg-forest",
          )}
        >
          {logo}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-display text-[15px] font-extrabold tracking-tight text-ink">
              {name}
            </span>
            <span className="rounded-[5px] bg-sand px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider text-muted">
              {chip}
            </span>
          </div>
        </div>
      </div>

      <p className="text-xs leading-relaxed text-muted">{description}</p>

      <div className="mt-auto pt-1">
        {comingSoon ? (
          <span className="block rounded-[10px] border border-line bg-sand/60 py-2.5 text-center text-xs font-bold text-label">
            Connect
          </span>
        ) : (
          <>
            {/* Disabled until the Square OAuth build wires it — never a dead
                live-looking button. */}
            <span className="block rounded-[10px] border border-line bg-sand/60 py-2.5 text-center text-xs font-bold text-label">
              {connectLabel ?? `Connect ${name}`}
            </span>
            {connectHint ? (
              <p className="mt-1.5 text-center font-mono text-[8px] font-bold uppercase tracking-wider text-label">
                {connectHint}
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

/** The design's Square glyph (rounded square with a filled centre). */
export function SquareLogo() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      strokeWidth="2"
      aria-hidden="true"
      className="text-surface"
    >
      <rect x="3" y="3" width="12" height="12" rx="3" stroke="currentColor" />
      <rect
        x="7"
        y="7"
        width="4"
        height="4"
        rx="1"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}
