import Link from "next/link";

import { cardStyles } from "@/app/_components/card";
import {
  GOOD_SCORE,
  OK_SCORE,
  type HealthBand,
  type IssueKind,
  type MenuHealthIssue,
  type MenuHealthReport,
  type Severity,
} from "@/lib/menu-health";
import { formatCents } from "@/lib/validation";

/* -------------------------------------------------------------------------- */
/*  Menu health panel — read-only.                                             */
/*                                                                            */
/*  Renders the score as a radial ring + per-dimension breakdown bars, plus a  */
/*  prioritised fix list bucketed by severity into collapsible High/Medium/Low */
/*  sections (native <details>, collapsed by default, no client JS). All of it */
/*  derives from the existing computeMenuHealth report — the breakdown bars    */
/*  are issue-counts-by-kind over totalItems, no new checks. It NEVER mutates  */
/*  anything: every row is a link back to the item/category in the editor.     */
/* -------------------------------------------------------------------------- */

const BAND_CAPTION: Record<HealthBand, string> = {
  good: "Good",
  ok: "OK · room to grow",
  poor: "Needs attention",
};

// Band → colour, used for the ring arc, the score text, and the band badge.
const BAND_TEXT: Record<HealthBand, string> = {
  good: "text-success-deep",
  ok: "text-accent-deep",
  poor: "text-[var(--color-warm)]",
};

const BAND_STROKE: Record<HealthBand, string> = {
  good: "var(--color-success)",
  ok: "var(--color-accent)",
  poor: "var(--color-warm)",
};

const SEVERITY_BADGE: Record<Severity, { label: string; className: string }> = {
  high: {
    label: "High",
    className: "bg-[var(--color-warm)]/15 text-[var(--color-warm)]",
  },
  medium: {
    label: "Medium",
    className: "bg-[var(--color-accent)]/15 text-accent-deep",
  },
  low: { label: "Low", className: "bg-sand text-muted" },
};

// Solid count pills for the issues header (High mirrors the StatusBadge "late"
// treatment — warm fill, white text; amber stays a tint, never a fill).
const SEVERITY_PILL: Record<Severity, string> = {
  high: "bg-[var(--color-warm-deep)] text-white",
  medium: "bg-[var(--color-accent)]/15 text-accent-deep",
  low: "bg-sand text-muted",
};

// Within a severity bucket, show the most actionable kinds first, then by title.
const KIND_RANK: Record<IssueKind, number> = {
  duplicate_name: 0,
  no_name: 1,
  invalid_price: 2,
  weak_description: 3,
  missing_photo: 4,
  price_outlier: 5,
  unavailable: 6,
  empty_category: 7,
};

const SEVERITY_ORDER: Severity[] = ["high", "medium", "low"];

// The anchor is `item-<id>` or `category-<id>`; map it to the master-detail
// selection param so the link selects-and-shows (instead of expand-and-scroll).
// A real <Link> (history push) — these deep-links are intentional navigations.
function issueHref(anchor: string): string {
  if (anchor.startsWith("item-")) {
    return `/dashboard/menu?item=${anchor.slice("item-".length)}`;
  }
  if (anchor.startsWith("category-")) {
    return `/dashboard/menu?category=${anchor.slice("category-".length)}`;
  }
  return "/dashboard/menu";
}

/* ------------------------------- score ring ------------------------------ */

const RING_RADIUS = 56;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function ScoreRing({ score, band }: { score: number; band: HealthBand }) {
  // Arc length proportional to the score; full circle at 100.
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

/** The POOR/OK/GOOD scale under the ring. Segment widths mirror the real
 *  thresholds (OK_SCORE/GOOD_SCORE), so the scale never drifts from the lib. */
function BandScale() {
  return (
    <div className="w-full">
      <div className="flex h-2 overflow-hidden rounded-full">
        <span
          style={{ width: `${OK_SCORE}%` }}
          className="bg-[var(--color-warm)]"
        />
        <span
          style={{ width: `${GOOD_SCORE - OK_SCORE}%` }}
          className="bg-accent"
        />
        <span
          style={{ width: `${100 - GOOD_SCORE}%` }}
          className="bg-[var(--color-success)]"
        />
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[9px] font-bold tracking-[0.08em]">
        <span className="text-[var(--color-warm)]">POOR 0–{OK_SCORE - 1}</span>
        <span className="text-accent-deep">
          OK {OK_SCORE}–{GOOD_SCORE - 1}
        </span>
        <span className="text-success-deep">GOOD {GOOD_SCORE}+</span>
      </div>
    </div>
  );
}

/* ------------------------------ breakdown bars --------------------------- */

type Dimension = { label: string; kinds: IssueKind[] };

// Per-item dimensions only: each listed kind is flagged at most once per item
// (invalid_price / price_outlier are mutually exclusive in computeMenuHealth),
// so counting issues counts affected items. Naming/duplicates stay in the
// issue list — duplicate rows are per-name, not per-item, so no honest per-item
// percentage exists. The export's "Allergens" bar is deliberately not adopted:
// there is no allergen check in the report to back it.
const DIMENSIONS: Dimension[] = [
  { label: "Photos", kinds: ["missing_photo"] },
  { label: "Descriptions", kinds: ["weak_description"] },
  { label: "Pricing", kinds: ["invalid_price", "price_outlier"] },
];

function breakdownPct(
  issues: MenuHealthIssue[],
  kinds: IssueKind[],
  totalItems: number,
): number {
  const affected = issues.filter((issue) => kinds.includes(issue.kind)).length;
  return Math.max(
    0,
    Math.round((100 * (totalItems - affected)) / totalItems),
  );
}

function BreakdownCard({ report }: { report: MenuHealthReport }) {
  return (
    <div className={cardStyles({ className: "p-4" })}>
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
        Breakdown
      </p>
      <div className="mt-3 space-y-2.5">
        {DIMENSIONS.map((dimension) => {
          const pct = breakdownPct(
            report.criticalIssues,
            dimension.kinds,
            report.totalItems,
          );
          const fill =
            pct >= GOOD_SCORE
              ? "bg-[var(--color-success)]"
              : pct >= OK_SCORE
                ? "bg-accent"
                : "bg-[var(--color-warm)]";
          return (
            <div key={dimension.label} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-xs font-medium text-ink">
                {dimension.label}
              </span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-sand">
                <span
                  style={{ width: `${pct}%` }}
                  className={`block h-full rounded-full ${fill}`}
                />
              </span>
              <span className="w-7 shrink-0 text-right font-mono text-[11px] font-bold text-muted">
                {pct}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------- issue list ------------------------------ */

function IssueRow({ issue }: { issue: MenuHealthIssue }) {
  const badge = SEVERITY_BADGE[issue.severity];
  return (
    <li>
      <Link
        href={issueHref(issue.anchor)}
        className="group flex items-start justify-between gap-3 rounded-md border border-line bg-sand/40 px-3 py-2 transition hover:bg-sand"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">
            {issue.title}
            {typeof issue.priceCents === "number" ? (
              <span className="ml-2 font-normal text-muted">
                ${formatCents(issue.priceCents)}
              </span>
            ) : null}
          </p>
          <p className="text-xs text-muted">{issue.detail}</p>
        </div>
        <span className="flex shrink-0 items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
          >
            {badge.label}
          </span>
          <span
            className="text-xs font-semibold opacity-0 transition group-hover:opacity-100 motion-reduce:transition-none"
            style={{ color: "var(--action)" }}
          >
            Fix →
          </span>
        </span>
      </Link>
    </li>
  );
}

function SeveritySection({
  severity,
  issues,
}: {
  severity: Severity;
  issues: MenuHealthIssue[];
}) {
  const badge = SEVERITY_BADGE[severity];
  const sorted = [...issues].sort(
    (a, b) =>
      KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.title.localeCompare(b.title),
  );
  return (
    <details className="group rounded-md border border-line">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
          >
            {badge.label}
          </span>
          <span className="text-sm text-muted">({sorted.length})</span>
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
          className="h-4 w-4 text-muted transition group-open:rotate-180"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </summary>
      <ul className="space-y-2 px-3 pb-3">
        {sorted.map((issue, index) => (
          <IssueRow key={`${issue.anchor}-${issue.kind}-${index}`} issue={issue} />
        ))}
      </ul>
    </details>
  );
}

/* --------------------------------- panel --------------------------------- */

export function MenuHealthPanel({ report }: { report: MenuHealthReport }) {
  // Bucket every issue (scored + advisory) by severity for the accordion. The
  // scored/advisory split still drives the score in computeMenuHealth; here it
  // is purely a prioritised, collapsible view.
  const allIssues = [...report.criticalIssues, ...report.advisories];
  const buckets = SEVERITY_ORDER.map((severity) => ({
    severity,
    issues: allIssues.filter((issue) => issue.severity === severity),
  })).filter((bucket) => bucket.issues.length > 0);

  return (
    <section className="py-8">
      <h2 className="font-display text-base font-semibold text-ink">
        Menu health
      </h2>
      {!report.hasItems ? (
        <div className={cardStyles({ className: "mt-3" })}>
          <p className="text-sm text-muted">
            Add items to your menu to see its health score.
          </p>
        </div>
      ) : (
        <div className="mt-3 grid gap-4 sm:grid-cols-[minmax(15rem,18rem)_1fr]">
          {/* Score column */}
          <div className="space-y-3">
            <div
              className={cardStyles({
                className: "flex flex-col items-center gap-4",
              })}
            >
              <ScoreRing score={report.score} band={report.band} />
              <BandScale />
              {/* Ring is aria-hidden; this is the same score for readers. */}
              <p className="sr-only">
                Menu health score {report.score} out of 100 —{" "}
                {BAND_CAPTION[report.band]}.
              </p>
            </div>
            {report.isHealthy ? null : <BreakdownCard report={report} />}
            <div className="flex items-start gap-2.5 rounded-card bg-forest-deep px-4 py-3">
              <span aria-hidden className="text-sm text-[var(--color-success)]">
                ℹ
              </span>
              <p className="text-xs leading-relaxed text-white/80">
                Prompt2Eat diagnoses — it never edits your menu. Every fix is one
                tap to the editor, in your hands.
              </p>
            </div>
          </div>

          {/* Issues column */}
          <div className="min-w-0 space-y-2">
            {report.isHealthy ? (
              <div className={cardStyles()}>
                <p className="text-sm font-medium text-ink">
                  Your menu looks great.
                </p>
                <p className="mt-1 text-sm text-muted">
                  Every item has a photo, a description, and a sensible price.
                </p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-display text-sm font-extrabold text-ink">
                    {allIssues.length}{" "}
                    {allIssues.length === 1 ? "issue" : "issues"} found
                  </p>
                  <span className="flex gap-1.5">
                    {buckets.map((bucket) => (
                      <span
                        key={bucket.severity}
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${SEVERITY_PILL[bucket.severity]}`}
                      >
                        {bucket.issues.length}{" "}
                        {SEVERITY_BADGE[bucket.severity].label}
                      </span>
                    ))}
                  </span>
                </div>
                <p className="text-xs text-muted">
                  {report.passingItems} of {report.totalItems}{" "}
                  {report.totalItems === 1 ? "item has" : "items have"} no high
                  or medium issues.
                </p>
                {buckets.map((bucket) => (
                  <SeveritySection
                    key={bucket.severity}
                    severity={bucket.severity}
                    issues={bucket.issues}
                  />
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
