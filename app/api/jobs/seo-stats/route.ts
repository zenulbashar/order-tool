import { isNotNull, sql } from "drizzle-orm";

import { isGeminiConfigured, runVisibilityProbe } from "@/lib/aeo-visibility";
import { FEATURES, hasFeature } from "@/lib/billing/plans";
import { db } from "@/lib/db";
import {
  aeoVisibilityProbes,
  seoSearchDaily,
  seoSearchSummary,
  venues,
} from "@/lib/db/schema";
import { reportError } from "@/lib/observability";
import { getBaseUrl } from "@/lib/url";
import {
  fetchDailyByPage,
  fetchTopQueriesForSlug,
  isSearchConsoleConfigured,
  SEARCH_ANALYTICS_ROW_LIMIT,
  slugFromPageUrl,
  toGscDate,
} from "@/lib/search-console";

// Neon pool + node:crypto JWT signing — keep off Edge.
export const runtime = "nodejs";
export const maxDuration = 60;

/** Trailing window ingested/upserted each run (GSC data settles over ~3 days,
 *  so re-upserting the window self-corrects late-arriving numbers). */
const DAILY_WINDOW_DAYS = 28;
/** Venue summaries (top queries) refreshed per tick, oldest first — a large
 *  fleet rotates across daily ticks instead of blowing the time budget. */
const SUMMARY_BATCH = 25;
const TOP_QUERIES_LIMIT = 10;
/** Rows per bulk upsert statement. */
const UPSERT_CHUNK = 400;

/**
 * Search-stats ingest (SEO & AEO studio). Runs daily via Vercel Cron
 * (vercel.json), guarded by CRON_SECRET exactly like /api/jobs/integrations.
 * Pulls the platform property's page×date performance in ONE Search Analytics
 * call, buckets rows by venue slug, and upserts per-venue daily stats; then
 * refreshes the oldest per-venue top-query summaries. A missing Google
 * credential is a clean no-op — the dashboard shows its "not connected" state.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return new Response("Cron secret is not configured.", { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized.", { status: 401 });
  }
  // Weekly AI-visibility probes for Scale-entitled live venues (metered: a
  // small batch per tick, oldest-probed first). Independent of Search Console,
  // so it runs even when GSC is not configured; the GSC section below still
  // bails on its own.
  const visibility = await runWeeklyVisibilityProbes();

  if (!isSearchConsoleConfigured()) {
    return Response.json({
      ok: true,
      skipped: "search-console-unconfigured",
      visibility,
    });
  }

  const liveVenues = await db
    .select({ id: venues.id, slug: venues.slug })
    .from(venues)
    .where(isNotNull(venues.onboardingCompletedAt));
  const venueIdBySlug = new Map(liveVenues.map((v) => [v.slug, v.id]));

  const now = Date.now();
  const range = {
    startDate: toGscDate(new Date(now - DAILY_WINDOW_DAYS * 86_400_000)),
    endDate: toGscDate(new Date(now)),
  };

  /* ---- 1) Daily rows: one property-wide page×date call, bucket by slug ---- */
  let dailyUpserts = 0;
  let truncated = false;
  const errors: string[] = [];
  try {
    const rows = await fetchDailyByPage(range);
    truncated = rows.length >= SEARCH_ANALYTICS_ROW_LIMIT;

    // Aggregate every page under /<slug>... to that venue+day: clicks and
    // impressions sum; position averages weighted by impressions.
    type Bucket = { clicks: number; impressions: number; positionWeight: number };
    const buckets = new Map<string, Bucket>();
    for (const row of rows) {
      const [page, day] = row.keys ?? [];
      if (!page || !day) continue;
      const slug = slugFromPageUrl(page);
      const venueId = slug ? venueIdBySlug.get(slug) : undefined;
      if (!venueId) continue; // marketing routes / unknown paths
      const key = `${venueId}\0${day}`;
      const bucket = buckets.get(key) ?? {
        clicks: 0,
        impressions: 0,
        positionWeight: 0,
      };
      bucket.clicks += row.clicks;
      bucket.impressions += row.impressions;
      bucket.positionWeight += row.position * row.impressions;
      buckets.set(key, bucket);
    }

    const values = [...buckets.entries()].map(([key, bucket]) => {
      const [venueId, day] = key.split("\0");
      return {
        venueId,
        day,
        clicks: bucket.clicks,
        impressions: bucket.impressions,
        ctr: bucket.impressions > 0 ? bucket.clicks / bucket.impressions : 0,
        position:
          bucket.impressions > 0
            ? bucket.positionWeight / bucket.impressions
            : 0,
      };
    });

    for (let start = 0; start < values.length; start += UPSERT_CHUNK) {
      const chunk = values.slice(start, start + UPSERT_CHUNK);
      await db
        .insert(seoSearchDaily)
        .values(chunk)
        .onConflictDoUpdate({
          target: [seoSearchDaily.venueId, seoSearchDaily.day],
          set: {
            clicks: sql`excluded.clicks`,
            impressions: sql`excluded.impressions`,
            ctr: sql`excluded.ctr`,
            position: sql`excluded.position`,
            updatedAt: new Date(),
          },
        });
      dailyUpserts += chunk.length;
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "daily ingest failed");
  }

  /* ---- 2) Top-query summaries: oldest-first rotation, bounded batch ------- */
  let summariesRefreshed = 0;
  const staleFirst = await db
    .select({ id: venues.id, slug: venues.slug })
    .from(venues)
    .leftJoin(seoSearchSummary, sql`${seoSearchSummary.venueId} = ${venues.id}`)
    .where(isNotNull(venues.onboardingCompletedAt))
    .orderBy(sql`${seoSearchSummary.fetchedAt} asc nulls first`)
    .limit(SUMMARY_BATCH);

  for (const venue of staleFirst) {
    try {
      const rows = await fetchTopQueriesForSlug(venue.slug, range, TOP_QUERIES_LIMIT);
      const topQueries = rows
        .filter((row) => row.keys?.[0])
        .map((row) => ({
          query: row.keys![0],
          clicks: row.clicks,
          impressions: row.impressions,
          position: row.position,
        }));
      await db
        .insert(seoSearchSummary)
        .values({ venueId: venue.id, topQueries, fetchedAt: new Date() })
        .onConflictDoUpdate({
          target: seoSearchSummary.venueId,
          set: { topQueries, fetchedAt: new Date() },
        });
      summariesRefreshed += 1;
    } catch {
      // One venue's failure never blocks the rest; it retries next tick by
      // staying oldest-first in the rotation.
      errors.push(`summary:${venue.slug}`);
    }
  }

  return Response.json({
    visibility,
    ok: true,
    dailyUpserts,
    summariesRefreshed,
    truncated,
    errors,
  });
}

/** Probe cadence: a venue is re-asked once its last cron run is this old. */
const VISIBILITY_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
/** Venues probed per tick — bounds the metered provider spend per day. */
const VISIBILITY_BATCH = 5;

async function runWeeklyVisibilityProbes(): Promise<{
  probed: number;
  skipped?: string;
}> {
  if (!isGeminiConfigured()) return { probed: 0, skipped: "gemini-unconfigured" };
  const cutoff = new Date(Date.now() - VISIBILITY_INTERVAL_MS);
  // Live venues on a plan that includes the studio, whose most recent probe of
  // any kind is older than the interval (or who have never been probed).
  const candidates = await db
    .select({
      id: venues.id,
      slug: venues.slug,
      name: venues.name,
      suburb: venues.suburb,
      state: venues.state,
      websiteUrl: venues.websiteUrl,
      plan: venues.plan,
      lastProbedAt: sql<Date | null>`(
        select max(${aeoVisibilityProbes.createdAt})
          from ${aeoVisibilityProbes}
         where ${aeoVisibilityProbes.venueId} = ${venues.id}
      )`,
    })
    .from(venues)
    .where(isNotNull(venues.onboardingCompletedAt));
  const due = candidates
    .filter((venue) => hasFeature({ plan: venue.plan }, FEATURES.SEO_AEO))
    .filter((venue) => !venue.lastProbedAt || new Date(venue.lastProbedAt) < cutoff)
    .sort((a, b) => {
      const at = a.lastProbedAt ? new Date(a.lastProbedAt).getTime() : 0;
      const bt = b.lastProbedAt ? new Date(b.lastProbedAt).getTime() : 0;
      return at - bt;
    })
    .slice(0, VISIBILITY_BATCH);
  let probed = 0;
  const siteOrigin = await getBaseUrl();
  for (const venue of due) {
    try {
      await runVisibilityProbe({ venue, siteOrigin, trigger: "cron" });
      probed += 1;
    } catch (error) {
      await reportError(error, {
        context: "jobs-cron.visibility-probe",
        tags: { venue_id: venue.id },
      });
    }
  }
  return { probed };
}
