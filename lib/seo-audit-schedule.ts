import "server-only";

import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";

import { FEATURES, hasFeature } from "@/lib/billing/plans";
import { db } from "@/lib/db";
import {
  menuCategories,
  menuItems,
  seoAudits,
  users,
  venueMembers,
  venues,
} from "@/lib/db/schema";
import { reportError } from "@/lib/observability";
import { computeAeoAudit, computeSeoAudit } from "@/lib/seo-audit";
import {
  type AuditKind,
  buildScoreDropEmail,
  detectScoreDrop,
  isDueForScheduledAudit,
  SCHEDULED_AUDIT_BATCH,
  type ScoreDrop,
} from "@/lib/seo-audit-schedule-core";
import { getBaseUrl } from "@/lib/url";

/**
 * Weekly scheduled re-audits (SEO & AEO studio v2, item 2). Runs from the
 * /api/jobs/seo-stats cron: for every live, Scale-entitled venue whose most
 * recent audit is a week old (or that has never been audited), re-run the
 * DETERMINISTIC scorer for both kinds and store the rows exactly as the owner
 * button would — minus the LLM layer, which stays owner-triggered and metered.
 * When a score falls (lib/seo-audit-schedule-core.ts decides), the venue's
 * owners get one plain-text email through the existing Resend credentials;
 * unset credentials make the nudge a silent no-op and the audit still lands.
 */

/** Same bound as the owner action: rows kept per venue+kind. */
const HISTORY_KEEP = 20;
const KINDS: readonly AuditKind[] = ["seo", "aeo"];

export type ScheduledAuditSummary = {
  audited: number;
  nudged: number;
  errors: string[];
};

export async function runScheduledAudits(
  now: number = Date.now(),
): Promise<ScheduledAuditSummary> {
  const summary: ScheduledAuditSummary = { audited: 0, nudged: 0, errors: [] };

  const candidates = await db
    .select({
      id: venues.id,
      plan: venues.plan,
      lastAuditAt: sql<Date | null>`(
        select max(${seoAudits.createdAt})
          from ${seoAudits}
         where ${seoAudits.venueId} = ${venues.id}
      )`,
    })
    .from(venues)
    .where(isNotNull(venues.onboardingCompletedAt));
  const due = candidates
    .filter((venue) => hasFeature({ plan: venue.plan }, FEATURES.SEO_AEO))
    .map((venue) => ({
      id: venue.id,
      lastAuditAt: venue.lastAuditAt ? new Date(venue.lastAuditAt) : null,
    }))
    .filter((venue) => isDueForScheduledAudit(venue.lastAuditAt, now))
    .sort((a, b) => (a.lastAuditAt?.getTime() ?? 0) - (b.lastAuditAt?.getTime() ?? 0))
    .slice(0, SCHEDULED_AUDIT_BATCH);

  const studioUrl = `${await getBaseUrl()}/dashboard/seo`;
  for (const candidate of due) {
    try {
      const drops = await auditVenue(candidate.id);
      summary.audited += 1;
      if (drops.length > 0 && (await nudgeOwners(candidate.id, drops, studioUrl))) {
        summary.nudged += 1;
      }
    } catch (error) {
      summary.errors.push(`audit:${candidate.id}`);
      await reportError(error, {
        context: "jobs-cron.scheduled-audit",
        tags: { venue_id: candidate.id },
      });
    }
  }
  return summary;
}

/** Run both kinds for one venue; returns the drops worth an owner nudge. */
async function auditVenue(venueId: string): Promise<ScoreDrop[]> {
  const [venue] = await db.select().from(venues).where(eq(venues.id, venueId)).limit(1);
  if (!venue) return [];
  const [items, categories] = await Promise.all([
    db.select().from(menuItems).where(eq(menuItems.venueId, venueId)),
    db.select().from(menuCategories).where(eq(menuCategories.venueId, venueId)),
  ]);

  const drops: ScoreDrop[] = [];
  for (const kind of KINDS) {
    const report =
      kind === "seo"
        ? computeSeoAudit(venue, items, categories)
        : computeAeoAudit(venue, items, categories);
    const [previous] = await db
      .select({ score: seoAudits.score, band: seoAudits.band })
      .from(seoAudits)
      .where(and(eq(seoAudits.venueId, venueId), eq(seoAudits.kind, kind)))
      .orderBy(desc(seoAudits.createdAt))
      .limit(1);

    await db.transaction(async (tx) => {
      await tx.insert(seoAudits).values({
        venueId,
        kind,
        score: report.score,
        band: report.band,
        checks: report.checks,
        issues: report.issues,
        recommendations: [],
        generatedCopy: null,
        model: null,
        trigger: "scheduled",
      });
      const stale = await tx
        .select({ id: seoAudits.id })
        .from(seoAudits)
        .where(and(eq(seoAudits.venueId, venueId), eq(seoAudits.kind, kind)))
        .orderBy(desc(seoAudits.createdAt))
        .offset(HISTORY_KEEP);
      if (stale.length > 0) {
        await tx.delete(seoAudits).where(
          and(
            eq(seoAudits.venueId, venueId),
            inArray(
              seoAudits.id,
              stale.map((row) => row.id),
            ),
          ),
        );
      }
    });

    const drop = detectScoreDrop(kind, previous ?? null, report);
    if (drop) drops.push(drop);
  }
  return drops;
}

/**
 * One email to every owner of the venue. Best-effort: unconfigured mailer or a
 * failed send returns false and never throws into the cron.
 */
async function nudgeOwners(
  venueId: string,
  drops: readonly ScoreDrop[],
  studioUrl: string,
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return false;

  const [venue] = await db
    .select({ name: venues.name })
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1);
  const owners = await db
    .select({ email: users.email })
    .from(venueMembers)
    .innerJoin(users, eq(users.id, venueMembers.userId))
    .where(and(eq(venueMembers.venueId, venueId), eq(venueMembers.role, "owner")))
    .orderBy(asc(venueMembers.createdAt));
  const to = owners.map((owner) => owner.email).filter(Boolean);
  if (!venue || to.length === 0) return false;

  const email = buildScoreDropEmail({ venueName: venue.name, drops, studioUrl });
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject: email.subject, text: email.text }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
