import "server-only";

import { and, desc, eq, notInArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { aeoVisibilityProbes } from "@/lib/db/schema";

import {
  AEO_VISIBILITY_PROVIDER,
  buildProbePrompts,
  DEFAULT_GEMINI_MODEL,
  detectCitation,
  parseGeminiResponse,
  RUNS_KEEP,
  type GroundedAnswer,
  type ProbeVenue,
} from "@/lib/aeo-visibility-core";

export {
  AEO_VISIBILITY_PROVIDER,
  ANSWER_MAX_CHARS,
  buildProbePrompts,
  detectCitation,
  parseGeminiResponse,
  RUNS_KEEP,
} from "@/lib/aeo-visibility-core";
export type { CitationVerdict, GroundedAnswer, ProbeVenue } from "@/lib/aeo-visibility-core";

/**
 * AI-visibility probes — the SEO & AEO studio's "rank tracker" for AI search.
 *
 * The AEO audit measures whether an assistant COULD answer the six canonical
 * diner questions from the venue's structured data. This measures whether one
 * actually DOES: each question is asked, personalised to the venue, of Gemini
 * with Google Search grounding (the same retrieval that powers Google's AI
 * answers), and the answer plus its grounding sources are recorded together
 * with whether the venue was cited. Runs are history, so an owner can see a
 * question flip from "not cited" to "cited" after fixing their storefront.
 *
 * Provider: Gemini's REST API, called with plain fetch like every other
 * third-party API in this codebase (Twilio, Resend) — no SDK. Gated on
 * GEMINI_API_KEY; unset means the feature is honestly "not configured", never a
 * fabricated result. Every call is a metered cost and is rate-limited by the
 * caller (aiVisibility bucket for owners; a small per-tick batch for the cron).
 */

const REQUEST_TIMEOUT_MS = 20_000;

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export function geminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}

async function askGemini(prompt: string): Promise<GroundedAnswer> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");
  const model = geminiModel();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          // Google Search grounding — the assistant answers from live search
          // results and reports which pages it used.
          tools: [{ google_search: {} }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 600 },
        }),
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      throw new Error(`Gemini responded ${response.status}.`);
    }
    return parseGeminiResponse(await response.json());
  } finally {
    clearTimeout(timer);
  }
}

export type VisibilityRunSummary = {
  runId: string;
  asked: number;
  cited: number;
  failed: number;
};

/**
 * Ask all six questions for a venue and record the answers. One failed
 * question does not abort the run (it is recorded as failed and skipped), so
 * a transient provider error costs one row, not the whole picture.
 */
export async function runVisibilityProbe(input: {
  venue: ProbeVenue;
  siteOrigin: string;
  trigger: "owner" | "cron";
}): Promise<VisibilityRunSummary> {
  const runId = crypto.randomUUID();
  const model = geminiModel();
  let cited = 0;
  let failed = 0;
  const prompts = buildProbePrompts(input.venue);
  for (const { question, prompt } of prompts) {
    let grounded: GroundedAnswer;
    try {
      grounded = await askGemini(prompt);
    } catch {
      failed += 1;
      continue;
    }
    const verdict = detectCitation({
      answer: grounded.answer,
      sources: grounded.sources,
      venue: input.venue,
      siteOrigin: input.siteOrigin,
    });
    if (verdict.cited) cited += 1;
    await db.insert(aeoVisibilityProbes).values({
      venueId: input.venue.id,
      runId,
      trigger: input.trigger,
      provider: AEO_VISIBILITY_PROVIDER,
      model,
      question,
      prompt,
      answer: grounded.answer,
      cited: verdict.cited,
      citedBy: verdict.citedBy,
      sources: grounded.sources,
    });
  }
  await pruneRuns(input.venue.id);
  return { runId, asked: prompts.length, cited, failed };
}

/** Keep the newest RUNS_KEEP runs per venue; delete everything older. */
async function pruneRuns(venueId: string): Promise<void> {
  const recent = await db
    .selectDistinctOn([aeoVisibilityProbes.runId], {
      runId: aeoVisibilityProbes.runId,
      createdAt: aeoVisibilityProbes.createdAt,
    })
    .from(aeoVisibilityProbes)
    .where(eq(aeoVisibilityProbes.venueId, venueId))
    .orderBy(aeoVisibilityProbes.runId, desc(aeoVisibilityProbes.createdAt));
  const keep = recent
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, RUNS_KEEP)
    .map((row) => row.runId);
  if (recent.length <= keep.length) return;
  await db
    .delete(aeoVisibilityProbes)
    .where(
      and(
        eq(aeoVisibilityProbes.venueId, venueId),
        notInArray(aeoVisibilityProbes.runId, keep),
      ),
    );
}

/** The most recent run's six rows, oldest question first (as asked). */
export async function getLatestVisibilityRun(venueId: string) {
  const [latest] = await db
    .select({ runId: aeoVisibilityProbes.runId })
    .from(aeoVisibilityProbes)
    .where(eq(aeoVisibilityProbes.venueId, venueId))
    .orderBy(desc(aeoVisibilityProbes.createdAt))
    .limit(1);
  if (!latest) return null;
  const rows = await db
    .select()
    .from(aeoVisibilityProbes)
    .where(
      and(
        eq(aeoVisibilityProbes.venueId, venueId),
        eq(aeoVisibilityProbes.runId, latest.runId),
      ),
    )
    .orderBy(aeoVisibilityProbes.createdAt);
  return rows;
}

/** Cited-count per run, oldest first, for the history strip. */
export async function getVisibilityHistory(
  venueId: string,
): Promise<{ runId: string; cited: number; asked: number; at: Date; trigger: string }[]> {
  const rows = await db
    .select({
      runId: aeoVisibilityProbes.runId,
      cited: aeoVisibilityProbes.cited,
      createdAt: aeoVisibilityProbes.createdAt,
      trigger: aeoVisibilityProbes.trigger,
    })
    .from(aeoVisibilityProbes)
    .where(eq(aeoVisibilityProbes.venueId, venueId))
    .orderBy(aeoVisibilityProbes.createdAt);
  const byRun = new Map<string, { cited: number; asked: number; at: Date; trigger: string }>();
  for (const row of rows) {
    const bucket = byRun.get(row.runId) ?? {
      cited: 0,
      asked: 0,
      at: row.createdAt,
      trigger: row.trigger,
    };
    bucket.asked += 1;
    if (row.cited) bucket.cited += 1;
    if (row.createdAt > bucket.at) bucket.at = row.createdAt;
    byRun.set(row.runId, bucket);
  }
  return [...byRun.entries()]
    .map(([runId, bucket]) => ({ runId, ...bucket }))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}
