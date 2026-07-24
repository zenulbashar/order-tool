import { and, asc, desc, eq, gte } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  seoAudits,
  seoSearchDaily,
  seoSearchSummary,
  type SeoAuditRow,
  type SeoSearchDailyRow,
  type SeoTopQuery,
} from "@/lib/db/schema";
import { scopedToVenue } from "@/lib/tenant";

/**
 * Read helpers for the SEO & AEO studio. Every query is venue-scoped via
 * scopedToVenue and rides the (venue_id, kind, created_at) index.
 */

export async function getLatestAudit(
  venueId: string,
  kind: "seo" | "aeo",
): Promise<SeoAuditRow | null> {
  const [row] = await db
    .select()
    .from(seoAudits)
    .where(
      and(scopedToVenue(seoAudits.venueId, venueId), eq(seoAudits.kind, kind)),
    )
    .orderBy(desc(seoAudits.createdAt))
    .limit(1);
  return row ?? null;
}

export type AuditHistoryPoint = {
  score: number;
  band: string;
  model: string | null;
  createdAt: Date;
};

/** Oldest→newest score history for the sparkline + delta (previous = n-2). */
export async function getAuditHistory(
  venueId: string,
  kind: "seo" | "aeo",
  limit = 12,
): Promise<AuditHistoryPoint[]> {
  const rows = await db
    .select({
      score: seoAudits.score,
      band: seoAudits.band,
      model: seoAudits.model,
      createdAt: seoAudits.createdAt,
    })
    .from(seoAudits)
    .where(
      and(scopedToVenue(seoAudits.venueId, venueId), eq(seoAudits.kind, kind)),
    )
    .orderBy(desc(seoAudits.createdAt))
    .limit(limit);
  return rows.reverse();
}

export type RecentAuditRow = {
  id: string;
  kind: "seo" | "aeo";
  score: number;
  band: string;
  model: string | null;
  createdAt: Date;
};

/** The most recent runs across both kinds, newest first (history table). */
export async function getRecentAudits(
  venueId: string,
  limit = 10,
): Promise<RecentAuditRow[]> {
  return db
    .select({
      id: seoAudits.id,
      kind: seoAudits.kind,
      score: seoAudits.score,
      band: seoAudits.band,
      model: seoAudits.model,
      createdAt: seoAudits.createdAt,
    })
    .from(seoAudits)
    .where(scopedToVenue(seoAudits.venueId, venueId))
    .orderBy(desc(seoAudits.createdAt))
    .limit(limit);
}

export type SearchStats = {
  /** Trailing-window daily rows, oldest first. */
  days: SeoSearchDailyRow[];
  totals: {
    clicks: number;
    impressions: number;
    /** Fraction 0..1 (render as %). */
    ctr: number;
    /** Impressions-weighted average position; 0 when no impressions. */
    position: number;
  };
  topQueries: SeoTopQuery[];
  /** When the top-query summary was last refreshed by the cron; null = never. */
  fetchedAt: Date | null;
};

const SEARCH_WINDOW_DAYS = 28;

/** Search Console stats for the venue over the trailing window. */
export async function getSearchStats(venueId: string): Promise<SearchStats> {
  const windowStart = new Date(Date.now() - SEARCH_WINDOW_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const [days, [summary]] = await Promise.all([
    db
      .select()
      .from(seoSearchDaily)
      .where(
        and(
          scopedToVenue(seoSearchDaily.venueId, venueId),
          gte(seoSearchDaily.day, windowStart),
        ),
      )
      .orderBy(asc(seoSearchDaily.day)),
    db
      .select()
      .from(seoSearchSummary)
      .where(scopedToVenue(seoSearchSummary.venueId, venueId))
      .limit(1),
  ]);

  let clicks = 0;
  let impressions = 0;
  let positionWeight = 0;
  for (const day of days) {
    clicks += day.clicks;
    impressions += day.impressions;
    positionWeight += day.position * day.impressions;
  }

  return {
    days,
    totals: {
      clicks,
      impressions,
      ctr: impressions > 0 ? clicks / impressions : 0,
      position: impressions > 0 ? positionWeight / impressions : 0,
    },
    topQueries: summary?.topQueries ?? [],
    fetchedAt: summary?.fetchedAt ?? null,
  };
}
