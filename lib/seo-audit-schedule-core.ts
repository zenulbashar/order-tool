/**
 * Scheduled SEO/AEO re-audits — the pure decisions. The cron half
 * (lib/seo-audit-schedule.ts) picks due venues, runs the DETERMINISTIC scorer
 * (never the LLM: the weekly pass is free and repeatable), stores the rows, and
 * asks these functions whether a run is due and whether the result deserves a
 * "your score dropped" nudge. Nothing here touches the database or the network.
 */

export type AuditKind = "seo" | "aeo";

/** A venue is re-audited once its most recent audit of any kind is this old. */
export const SCHEDULED_AUDIT_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
/** Venues audited per cron tick — the scorer is cheap, but the tick is shared. */
export const SCHEDULED_AUDIT_BATCH = 15;
/** A fall of this many points (or a worse band) between two runs earns a nudge. */
export const SCORE_DROP_THRESHOLD = 10;
/** Issues quoted in the nudge, most severe first. */
export const NUDGE_ISSUE_LIMIT = 3;

const BAND_RANK: Record<string, number> = { good: 2, ok: 1, poor: 0 };

export function isDueForScheduledAudit(
  lastAuditAt: Date | null,
  now: number,
  intervalMs: number = SCHEDULED_AUDIT_INTERVAL_MS,
): boolean {
  if (!lastAuditAt) return true;
  return now - lastAuditAt.getTime() >= intervalMs;
}

export type ScoreSnapshot = { score: number; band: string };

export type ScoreDrop = {
  kind: AuditKind;
  previousScore: number;
  currentScore: number;
  previousBand: string;
  currentBand: string;
  topIssues: string[];
};

/**
 * A drop is a fall of at least SCORE_DROP_THRESHOLD points OR a fall to a worse
 * band (good → ok is worth telling the owner even at 9 points). The first ever
 * run has nothing to compare against and never nudges.
 */
export function detectScoreDrop(
  kind: AuditKind,
  previous: ScoreSnapshot | null,
  current: ScoreSnapshot & { issues: readonly { title: string }[] },
  threshold: number = SCORE_DROP_THRESHOLD,
): ScoreDrop | null {
  if (!previous) return null;
  const pointsDrop = previous.score - current.score;
  const bandFell =
    (BAND_RANK[current.band] ?? 0) < (BAND_RANK[previous.band] ?? 0);
  if (pointsDrop < threshold && !bandFell) return null;
  return {
    kind,
    previousScore: previous.score,
    currentScore: current.score,
    previousBand: previous.band,
    currentBand: current.band,
    topIssues: current.issues.slice(0, NUDGE_ISSUE_LIMIT).map((issue) => issue.title),
  };
}

const KIND_LABEL: Record<AuditKind, string> = {
  seo: "SEO (Google search)",
  aeo: "AEO (AI assistants)",
};

/** Plain-text owner nudge. One email per venue per run, both kinds together. */
export function buildScoreDropEmail(input: {
  venueName: string;
  drops: readonly ScoreDrop[];
  studioUrl: string;
}): { subject: string; text: string } {
  const kinds = input.drops.map((drop) => drop.kind.toUpperCase()).join(" and ");
  const subject = `${input.venueName}: your ${kinds} score dropped`;
  const lines: string[] = [
    `We re-checked ${input.venueName}'s storefront this week and a score went down.`,
    "",
  ];
  for (const drop of input.drops) {
    lines.push(
      `${KIND_LABEL[drop.kind]}: ${drop.previousScore} → ${drop.currentScore} (${drop.previousBand} → ${drop.currentBand})`,
    );
    for (const issue of drop.topIssues) lines.push(`  - ${issue}`);
    lines.push("");
  }
  lines.push(
    "Scores fall when storefront details go missing or the menu changes — usually a quick fix.",
    "See what changed and the suggested fixes:",
    input.studioUrl,
    "",
    "This is a checks-only run (no AI drafting); open the studio for AI-drafted fixes.",
  );
  return { subject, text: lines.join("\n") };
}
