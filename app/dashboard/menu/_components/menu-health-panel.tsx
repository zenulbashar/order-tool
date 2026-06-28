import Link from "next/link";

import type {
  HealthBand,
  IssueKind,
  MenuHealthIssue,
  MenuHealthReport,
  Severity,
} from "@/lib/menu-health";
import { formatCents } from "@/lib/validation";

/* -------------------------------------------------------------------------- */
/*  Menu health panel — read-only.                                             */
/*                                                                            */
/*  Renders the score + a prioritised fix list, bucketed by severity into      */
/*  collapsible High/Medium/Low sections (native <details>, collapsed by       */
/*  default, no client JS). It NEVER mutates anything: every row is a link      */
/*  back to the item/category in the existing editor on this same page.        */
/* -------------------------------------------------------------------------- */

const BAND_BADGE: Record<HealthBand, { label: string; className: string }> = {
  good: { label: "Healthy", className: "bg-green-100 text-green-800" },
  ok: { label: "Needs work", className: "bg-amber-100 text-amber-800" },
  poor: { label: "Needs attention", className: "bg-red-100 text-red-800" },
};

const BAND_SCORE_COLOR: Record<HealthBand, string> = {
  good: "text-green-700",
  ok: "text-amber-700",
  poor: "text-red-700",
};

const SEVERITY_BADGE: Record<Severity, { label: string; className: string }> = {
  high: { label: "High", className: "bg-red-100 text-red-700" },
  medium: { label: "Medium", className: "bg-amber-100 text-amber-700" },
  low: { label: "Low", className: "bg-gray-100 text-gray-500" },
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

function IssueRow({ issue }: { issue: MenuHealthIssue }) {
  const badge = SEVERITY_BADGE[issue.severity];
  return (
    <li>
      <Link
        href={`/dashboard/menu#${issue.anchor}`}
        className="flex items-start justify-between gap-3 rounded-md border border-gray-200 bg-gray-50/50 px-3 py-2 transition hover:border-gray-300 hover:bg-gray-50"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-gray-900">
            {issue.title}
            {typeof issue.priceCents === "number" ? (
              <span className="ml-2 font-normal text-gray-500">
                ${formatCents(issue.priceCents)}
              </span>
            ) : null}
          </p>
          <p className="text-xs text-gray-500">{issue.detail}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
        >
          {badge.label}
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
    <details className="group rounded-md border border-gray-200">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
          >
            {badge.label}
          </span>
          <span className="text-sm text-gray-500">({sorted.length})</span>
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
          className="h-4 w-4 text-gray-400 transition group-open:rotate-180"
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
      <h2 className="text-sm font-semibold text-gray-900">Menu health</h2>
      <div className="mt-3 rounded-lg border border-gray-200 p-4">
        {!report.hasItems ? (
          <p className="text-sm text-gray-500">
            Add items to your menu to see its health score.
          </p>
        ) : report.isHealthy ? (
          <div>
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-semibold tracking-tight text-green-700">
                100
              </span>
              <span className="text-sm text-gray-400">/ 100</span>
            </div>
            <p className="mt-2 text-sm text-gray-700">
              Your menu looks great. Every item has a photo, a description, and a
              sensible price.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`text-3xl font-semibold tracking-tight ${BAND_SCORE_COLOR[report.band]}`}
                >
                  {report.score}
                </span>
                <span className="text-sm text-gray-400">/ 100</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${BAND_BADGE[report.band].className}`}
                >
                  {BAND_BADGE[report.band].label}
                </span>
              </div>
              <p className="mt-2 text-sm text-gray-500">
                {report.passingItems} of {report.totalItems}{" "}
                {report.totalItems === 1 ? "item has" : "items have"} no high or
                medium issues.
              </p>
            </div>

            {buckets.length > 0 ? (
              <div className="space-y-2">
                {buckets.map((bucket) => (
                  <SeveritySection
                    key={bucket.severity}
                    severity={bucket.severity}
                    issues={bucket.issues}
                  />
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
