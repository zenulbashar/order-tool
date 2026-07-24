import Link from "next/link";

import type { SeoAuditIssue, SeoAuditSeverity } from "@/lib/db/schema";

/**
 * Prioritised fix list — severity-bucketed collapsible sections (native
 * <details>, no client JS), each row deep-linking to the dashboard page that
 * fixes it. Same idiom as the menu-health panel; read-only by design.
 */

const SEVERITY_BADGE: Record<SeoAuditSeverity, { label: string; className: string }> =
  {
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

const SEVERITY_PILL: Record<SeoAuditSeverity, string> = {
  high: "bg-[var(--color-warm-deep)] text-white",
  medium: "bg-[var(--color-accent)]/15 text-accent-deep",
  low: "bg-sand text-muted",
};

const SEVERITY_ORDER: SeoAuditSeverity[] = ["high", "medium", "low"];

function IssueRow({ issue }: { issue: SeoAuditIssue }) {
  const badge = SEVERITY_BADGE[issue.severity];
  const body = (
    <>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink">{issue.title}</p>
        <p className="text-xs text-muted">{issue.detail}</p>
      </div>
      <span className="flex shrink-0 items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
        >
          {badge.label}
        </span>
        {issue.fixHref ? (
          <span
            className="text-xs font-semibold opacity-0 transition group-hover:opacity-100 motion-reduce:transition-none"
            style={{ color: "var(--action)" }}
          >
            Fix →
          </span>
        ) : null}
      </span>
    </>
  );
  const rowClass =
    "group flex items-start justify-between gap-3 rounded-md border border-line bg-sand/40 px-3 py-2 transition hover:bg-sand";
  return (
    <li>
      {issue.fixHref ? (
        <Link href={issue.fixHref} className={rowClass}>
          {body}
        </Link>
      ) : (
        <div className={rowClass}>{body}</div>
      )}
    </li>
  );
}

export function IssuesList({ issues }: { issues: SeoAuditIssue[] }) {
  if (issues.length === 0) {
    return (
      <p className="text-sm text-muted">
        Every check passed. Nothing to fix right now.
      </p>
    );
  }
  const buckets = SEVERITY_ORDER.map((severity) => ({
    severity,
    issues: issues.filter((issue) => issue.severity === severity),
  })).filter((bucket) => bucket.issues.length > 0);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-display text-sm font-extrabold text-ink">
          {issues.length} {issues.length === 1 ? "issue" : "issues"} found
        </p>
        <span className="flex gap-1.5">
          {buckets.map((bucket) => (
            <span
              key={bucket.severity}
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${SEVERITY_PILL[bucket.severity]}`}
            >
              {bucket.issues.length} {SEVERITY_BADGE[bucket.severity].label}
            </span>
          ))}
        </span>
      </div>
      {buckets.map((bucket, index) => (
        <details
          key={bucket.severity}
          className="group rounded-md border border-line"
          open={index === 0}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${SEVERITY_BADGE[bucket.severity].className}`}
              >
                {SEVERITY_BADGE[bucket.severity].label}
              </span>
              <span className="text-sm text-muted">({bucket.issues.length})</span>
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
            {bucket.issues.map((issue) => (
              <IssueRow key={issue.checkId} issue={issue} />
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}
