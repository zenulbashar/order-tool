import { cardStyles } from "@/app/_components/card";
import type { SeoAuditRow } from "@/lib/db/schema";
import type { SeoAuditBand, SeoAuditCategorySummary } from "@/lib/seo-audit";

import type { AuditHistoryPoint } from "../queries";
import { CopyReviewCard } from "./copy-review-card";
import { IssuesList } from "./issues-list";
import { RunAuditButton } from "./run-audit-button";
import {
  BandScale,
  CategoryBars,
  ScoreDelta,
  ScoreRing,
  ScoreSparkline,
} from "./score-viz";

/**
 * One audit column (SEO or AEO): score ring + delta + history sparkline,
 * category breakdown, AI review card, and the prioritised issue list. Server
 * component — the only client islands are the Run button and the review card.
 */

const PANEL_TITLE: Record<"seo" | "aeo", string> = {
  seo: "SEO — Google search",
  aeo: "AEO — AI assistants",
};

const PANEL_INTRO: Record<"seo" | "aeo", string> = {
  seo: "How ready your storefront is to rank in classic search results.",
  aeo: "How well AI assistants (ChatGPT, Claude, Perplexity) can answer diner questions about you.",
};

const dateFormat = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

/** Category summaries from the stored checks (same math as the scorer). */
function categoriesFromChecks(row: SeoAuditRow): SeoAuditCategorySummary[] {
  const labels: Record<string, string> = {
    profile: "Business profile",
    menu: "Menu content",
    discoverability: "Discoverability",
    answerability: "Answerability",
    machine: "Machine readability",
  };
  const byCategory = new Map<string, { total: number; passed: number }>();
  for (const check of row.checks) {
    if (!check.applicable) continue;
    const bucket = byCategory.get(check.category) ?? { total: 0, passed: 0 };
    bucket.total += check.weight;
    if (check.passed) bucket.passed += check.weight;
    byCategory.set(check.category, bucket);
  }
  return [...byCategory.entries()].map(([key, bucket]) => ({
    key: key as SeoAuditCategorySummary["key"],
    label: labels[key] ?? key,
    pct: bucket.total === 0 ? 0 : Math.round((100 * bucket.passed) / bucket.total),
  }));
}

export function AuditPanel({
  kind,
  latest,
  history,
  currentDescription,
}: {
  kind: "seo" | "aeo";
  latest: SeoAuditRow | null;
  history: AuditHistoryPoint[];
  currentDescription: string | null;
}) {
  const previous = history.length >= 2 ? history[history.length - 2] : null;
  const delta = latest && previous ? latest.score - previous.score : null;

  return (
    <section className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold text-ink">
            {PANEL_TITLE[kind]}
          </h2>
          <p className="mt-0.5 text-xs text-muted">{PANEL_INTRO[kind]}</p>
          {latest ? (
            <p className="mt-1 font-mono text-[10px] font-bold uppercase tracking-wider text-label">
              Last run {dateFormat.format(latest.createdAt)} ·{" "}
              {latest.model ? "AI + checks" : "checks only"}
            </p>
          ) : null}
        </div>
        <RunAuditButton kind={kind} hasRun={latest !== null} />
      </div>

      {!latest ? (
        <div className={cardStyles({ className: "mt-3" })}>
          <p className="text-sm font-medium text-ink">
            No {kind.toUpperCase()} audit yet.
          </p>
          <p className="mt-1 text-sm text-muted">
            One click checks your storefront against{" "}
            {kind === "seo"
              ? "the signals Google reads (profile, menu content, structured data)"
              : "the questions AI assistants try to answer from your page"}
            , scores it, and drafts fixes for you to review. Nothing is
            published without you.
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div
            className={cardStyles({
              className: "flex flex-col items-center gap-4",
            })}
          >
            <ScoreRing score={latest.score} band={latest.band as SeoAuditBand} />
            <div className="flex items-center gap-3">
              <ScoreDelta value={delta} />
              <ScoreSparkline values={history.map((point) => point.score)} />
            </div>
            <BandScale />
            <p className="sr-only">
              {PANEL_TITLE[kind]} score {latest.score} out of 100.
            </p>
          </div>

          <div className={cardStyles({ className: "p-4" })}>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
              Breakdown
            </p>
            <div className="mt-3">
              <CategoryBars categories={categoriesFromChecks(latest)} />
            </div>
          </div>

          {latest.generatedCopy ? (
            <CopyReviewCard
              auditId={latest.id}
              kind={kind}
              currentDescription={currentDescription}
              copy={latest.generatedCopy}
            />
          ) : null}

          {latest.recommendations.length > 0 ? (
            <div className={cardStyles({ className: "p-4" })}>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
                Recommendations
              </p>
              <ul className="mt-2 space-y-2">
                {latest.recommendations.map((rec) => (
                  <li key={rec.title}>
                    <p className="text-sm font-medium text-ink">{rec.title}</p>
                    <p className="text-xs text-muted">{rec.detail}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <IssuesList issues={latest.issues} />
        </div>
      )}
    </section>
  );
}
