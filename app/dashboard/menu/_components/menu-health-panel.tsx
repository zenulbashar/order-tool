import Link from "next/link";

import type {
  HealthBand,
  MenuHealthIssue,
  MenuHealthReport,
  Severity,
} from "@/lib/menu-health";
import { formatCents } from "@/lib/validation";

/* -------------------------------------------------------------------------- */
/*  Menu health panel — read-only.                                             */
/*                                                                            */
/*  Renders the score + a prioritised, deep-linked fix list. It NEVER mutates  */
/*  anything: every row is a link back to the item/category in the existing    */
/*  editor on this same page. Fixing happens there.                            */
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

export function MenuHealthPanel({ report }: { report: MenuHealthReport }) {
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
              Your menu looks great — every item has a photo, a description, and
              a sensible price.
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
                {report.totalItems === 1 ? "item has" : "items have"} no issues.
              </p>
            </div>

            {report.criticalIssues.length > 0 ? (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Fix these ({report.criticalIssues.length})
                </h3>
                <ul className="mt-2 space-y-2">
                  {report.criticalIssues.map((issue, index) => (
                    <IssueRow key={`${issue.anchor}-${issue.kind}-${index}`} issue={issue} />
                  ))}
                </ul>
              </div>
            ) : null}

            {report.advisories.length > 0 ? (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Also worth checking ({report.advisories.length})
                </h3>
                <ul className="mt-2 space-y-2">
                  {report.advisories.map((issue, index) => (
                    <IssueRow key={`${issue.anchor}-${issue.kind}-${index}`} issue={issue} />
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
