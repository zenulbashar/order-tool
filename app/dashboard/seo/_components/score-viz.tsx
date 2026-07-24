import { cx } from "@/app/_components/cx";
import type { SeoAuditBand } from "@/lib/seo-audit";
import { SEO_GOOD_SCORE, SEO_OK_SCORE } from "@/lib/seo-audit";

/* -------------------------------------------------------------------------- */
/*  Score visualisations for the SEO & AEO studio. Deliberately COPIED from    */
/*  the menu-health panel + dashboard home primitives (both module-private)    */
/*  rather than refactoring those modules; extract a shared score-viz only if  */
/*  a third consumer appears. Presentational, no hooks — server-safe.          */
/* -------------------------------------------------------------------------- */

export const BAND_CAPTION: Record<SeoAuditBand, string> = {
  good: "Good",
  ok: "OK · room to grow",
  poor: "Needs attention",
};

const BAND_TEXT: Record<SeoAuditBand, string> = {
  good: "text-success-deep",
  ok: "text-accent-deep",
  poor: "text-[var(--color-warm)]",
};

const BAND_STROKE: Record<SeoAuditBand, string> = {
  good: "var(--color-success)",
  ok: "var(--color-accent)",
  poor: "var(--color-warm)",
};

const RING_RADIUS = 56;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function ScoreRing({ score, band }: { score: number; band: SeoAuditBand }) {
  const offset = RING_CIRCUMFERENCE * (1 - score / 100);
  return (
    <div className="relative h-36 w-36">
      <svg viewBox="0 0 136 136" className="h-full w-full" aria-hidden="true">
        <circle
          cx="68"
          cy="68"
          r={RING_RADIUS}
          fill="none"
          stroke="var(--color-sand)"
          strokeWidth="12"
        />
        <circle
          cx="68"
          cy="68"
          r={RING_RADIUS}
          fill="none"
          stroke={BAND_STROKE[band]}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={offset}
          transform="rotate(-90 68 68)"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-4xl font-extrabold leading-none tracking-tight text-ink">
          {score}
        </span>
        <span
          className={`mt-1 font-mono text-[9px] font-bold uppercase tracking-[0.12em] ${BAND_TEXT[band]}`}
        >
          {BAND_CAPTION[band]}
        </span>
      </div>
    </div>
  );
}

/** POOR/OK/GOOD scale whose segment widths mirror the real thresholds. */
export function BandScale() {
  return (
    <div className="w-full">
      <div className="flex h-2 overflow-hidden rounded-full">
        <span
          style={{ width: `${SEO_OK_SCORE}%` }}
          className="bg-[var(--color-warm)]"
        />
        <span
          style={{ width: `${SEO_GOOD_SCORE - SEO_OK_SCORE}%` }}
          className="bg-accent"
        />
        <span
          style={{ width: `${100 - SEO_GOOD_SCORE}%` }}
          className="bg-[var(--color-success)]"
        />
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[9px] font-bold tracking-[0.08em]">
        <span className="text-[var(--color-warm)]">POOR 0–{SEO_OK_SCORE - 1}</span>
        <span className="text-accent-deep">
          OK {SEO_OK_SCORE}–{SEO_GOOD_SCORE - 1}
        </span>
        <span className="text-success-deep">GOOD {SEO_GOOD_SCORE}+</span>
      </div>
    </div>
  );
}

/** Score history polyline (same idiom as the dashboard-home Sparkline). */
export function ScoreSparkline({ values }: { values: number[] }) {
  const w = 120;
  const h = 28;
  const pad = 3;
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * w;
      const y = pad + (1 - (value - min) / span) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      fill="none"
      stroke="var(--color-accent)"
      strokeWidth={2}
      aria-hidden="true"
    >
      <polyline points={points} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** ▲/▼ percent-point change vs the previous run ("new" when none exists). */
export function ScoreDelta({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="text-[11px] font-semibold text-muted">first run</span>;
  }
  const up = value >= 0;
  return (
    <span
      className={cx(
        "text-[11px] font-bold",
        up ? "text-success-deep" : "text-warm-deep",
      )}
    >
      {up ? "▲" : "▼"} {Math.abs(value)} pts
    </span>
  );
}

/** Per-category weighted pass bars (BreakdownCard idiom from menu health). */
export function CategoryBars({
  categories,
}: {
  categories: { key: string; label: string; pct: number }[];
}) {
  return (
    <div className="space-y-2.5">
      {categories.map((category) => {
        const fill =
          category.pct >= SEO_GOOD_SCORE
            ? "bg-[var(--color-success)]"
            : category.pct >= SEO_OK_SCORE
              ? "bg-accent"
              : "bg-[var(--color-warm)]";
        return (
          <div key={category.key} className="flex items-center gap-3">
            <span className="w-32 shrink-0 text-xs font-medium text-ink">
              {category.label}
            </span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-sand">
              <span
                style={{ width: `${category.pct}%` }}
                className={`block h-full rounded-full ${fill}`}
              />
            </span>
            <span className="w-7 shrink-0 text-right font-mono text-[11px] font-bold text-muted">
              {category.pct}
            </span>
          </div>
        );
      })}
    </div>
  );
}
