"use server";

import type Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAnthropic } from "@/lib/anthropic";
import { auth } from "@/lib/auth";
import { FEATURES, hasFeature } from "@/lib/billing/plans";
import { getVenuePlan } from "@/lib/billing/queries";
import { db } from "@/lib/db";
import {
  seoAudits,
  venues,
  type SeoAuditRecommendation,
  type SeoGeneratedCopy,
} from "@/lib/db/schema";
import { checkRateLimit } from "@/lib/rate-limit";
import { computeAeoAudit, computeSeoAudit } from "@/lib/seo-audit";
import {
  AEO_LLM_JSON_SCHEMA,
  AEO_LLM_SYSTEM,
  aeoLlmResponseSchema,
  buildAuditLlmInput,
  SEO_AUDIT_MAX_TOKENS,
  SEO_AUDIT_MODEL,
  SEO_LLM_JSON_SCHEMA,
  SEO_LLM_SYSTEM,
  seoLlmResponseSchema,
  toAeoGeneratedCopy,
  toSeoGeneratedCopy,
} from "@/lib/seo-audit-llm";
import { requireVenue, scopedToVenue, type Venue } from "@/lib/tenant";
import { storefrontDescriptionSchema } from "@/lib/validation";

import { getCategoriesForVenue, getItemsForVenue } from "../menu/queries";

const SEO_PATH = "/dashboard/seo";
/** Audit rows kept per venue+kind — enough history for the sparkline. */
const HISTORY_KEEP = 20;

const SCALE_ONLY =
  "The SEO & AEO studio is part of the Scale plan. Upgrade in Plan & billing to run audits.";

/**
 * Server Functions are reachable via direct POST, so re-check auth on every
 * call before resolving the tenant (same contract as the menu AI actions).
 * These redirects throw control-flow signals — call OUTSIDE any try/catch.
 */
async function requireVenueForAction(): Promise<Venue> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
  return requireVenue();
}

/**
 * The Scale gate, re-checked INSIDE every action: the locked page never
 * renders the buttons, but a forged POST must still fail here.
 */
async function isSeoEntitled(venueId: string): Promise<boolean> {
  const plan = await getVenuePlan(venueId);
  return plan !== null && hasFeature({ plan }, FEATURES.SEO_AEO);
}

/** Defensive read of a structured-output message into JSON, or null. */
function readJson(message: Anthropic.Message): unknown {
  if (
    message.stop_reason === "refusal" ||
    message.stop_reason === "max_tokens"
  ) {
    return null;
  }
  const textBlock = message.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text",
  );
  if (!textBlock) return null;
  try {
    return JSON.parse(textBlock.text);
  } catch {
    return null;
  }
}

export type RunAuditResult =
  | { ok: true; llm: "ok" | "skipped" }
  | { ok: false; error: string };

/**
 * The one-click audit. The deterministic scorer ALWAYS runs and persists; the
 * LLM layer (assessment, drafted copy, recommendations, AEO Q&A) is additive
 * and FAIL-OPEN — rate-limited, unavailable, refused, or invalid output all
 * degrade to a checks-only audit (`model: null`), never an error.
 */
async function runAudit(kind: "seo" | "aeo"): Promise<RunAuditResult> {
  const venue = await requireVenueForAction();
  if (!(await isSeoEntitled(venue.id))) {
    return { ok: false, error: SCALE_ONLY };
  }

  const [items, categories] = await Promise.all([
    getItemsForVenue(venue.id),
    getCategoriesForVenue(venue.id),
  ]);
  const report =
    kind === "seo"
      ? computeSeoAudit(venue, items, categories)
      : computeAeoAudit(venue, items, categories);

  let generatedCopy: SeoGeneratedCopy | null = null;
  let recommendations: SeoAuditRecommendation[] = [];
  let model: string | null = null;

  // Cost gate in front of the metered call only — an over-limit run still
  // persists the deterministic audit below. Fail-open on limiter errors.
  const limit = await checkRateLimit("aiSeoAudit", venue.id);
  if (limit.success) {
    try {
      const message = await getAnthropic().messages.create({
        model: SEO_AUDIT_MODEL,
        max_tokens: SEO_AUDIT_MAX_TOKENS,
        system: kind === "seo" ? SEO_LLM_SYSTEM : AEO_LLM_SYSTEM,
        output_config: {
          format: {
            type: "json_schema",
            schema: kind === "seo" ? SEO_LLM_JSON_SCHEMA : AEO_LLM_JSON_SCHEMA,
          },
        },
        messages: [
          {
            role: "user",
            content: buildAuditLlmInput(venue, items, categories, report),
          },
        ],
      });
      const json = readJson(message);
      if (kind === "seo") {
        const parsed = seoLlmResponseSchema.safeParse(json);
        if (parsed.success) {
          const normalized = toSeoGeneratedCopy(parsed.data);
          generatedCopy = normalized.copy;
          recommendations = normalized.recommendations;
          model = SEO_AUDIT_MODEL;
        }
      } else {
        const parsed = aeoLlmResponseSchema.safeParse(json);
        if (parsed.success) {
          const normalized = toAeoGeneratedCopy(parsed.data);
          generatedCopy = normalized.copy;
          recommendations = normalized.recommendations;
          model = SEO_AUDIT_MODEL;
        }
      }
    } catch {
      // Deterministic-only run — the audit still succeeds.
    }
  }

  await db.transaction(async (tx) => {
    await tx.insert(seoAudits).values({
      venueId: venue.id,
      kind,
      score: report.score,
      band: report.band,
      checks: report.checks,
      issues: report.issues,
      recommendations,
      generatedCopy,
      model,
    });
    // Bound history: drop rows beyond the newest HISTORY_KEEP for this
    // venue+kind (venue-scoped, same transaction as the insert).
    const stale = await tx
      .select({ id: seoAudits.id })
      .from(seoAudits)
      .where(
        and(
          scopedToVenue(seoAudits.venueId, venue.id),
          eq(seoAudits.kind, kind),
        ),
      )
      .orderBy(desc(seoAudits.createdAt))
      .offset(HISTORY_KEEP);
    if (stale.length > 0) {
      await tx.delete(seoAudits).where(
        and(
          scopedToVenue(seoAudits.venueId, venue.id),
          inArray(
            seoAudits.id,
            stale.map((row) => row.id),
          ),
        ),
      );
    }
  });

  revalidatePath(SEO_PATH);
  return { ok: true, llm: model !== null ? "ok" : "skipped" };
}

export async function runSeoAudit(): Promise<RunAuditResult> {
  return runAudit("seo");
}

export async function runAeoAudit(): Promise<RunAuditResult> {
  return runAudit("aeo");
}

export type ApplyCopyResult = { ok: true } | { ok: false; error: string };

/**
 * The "Apply to storefront" accept gate for the drafted description. The
 * stored copy is re-read BY (auditId AND venueId) — the IDOR gate; a forged
 * or foreign id yields no row and no write. Client text is never trusted, and
 * the write goes through the SAME validation as the manual About form.
 */
export async function applyGeneratedCopy(input: {
  auditId: string;
}): Promise<ApplyCopyResult> {
  const venue = await requireVenueForAction();
  if (!(await isSeoEntitled(venue.id))) {
    return { ok: false, error: SCALE_ONLY };
  }

  const auditId = typeof input?.auditId === "string" ? input.auditId.trim() : "";
  if (auditId.length === 0) {
    return { ok: false, error: "That audit could not be found. Run a new one." };
  }

  const [audit] = await db
    .select({ generatedCopy: seoAudits.generatedCopy })
    .from(seoAudits)
    .where(
      and(eq(seoAudits.id, auditId), scopedToVenue(seoAudits.venueId, venue.id)),
    )
    .limit(1);

  const proposed = audit?.generatedCopy?.optimizedDescription;
  if (!proposed) {
    return {
      ok: false,
      error: "This audit has no drafted description. Run a new audit first.",
    };
  }

  const parsed = storefrontDescriptionSchema.safeParse(proposed);
  if (!parsed.success || parsed.data === null) {
    return {
      ok: false,
      error: "The drafted description didn't pass validation. Run a new audit.",
    };
  }

  await db
    .update(venues)
    .set({ storefrontDescription: parsed.data })
    .where(eq(venues.id, venue.id));

  revalidatePath(SEO_PATH);
  revalidatePath("/dashboard/settings/about");
  revalidatePath(`/${venue.slug}`);
  return { ok: true };
}
