"use server";

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { FEATURES, hasFeature } from "@/lib/billing/plans";
import { getVenuePlan } from "@/lib/billing/queries";
import { type AskInsightsResult, askInsights, loadInsightsFacts } from "@/lib/insights";
import { sanitiseQuestion } from "@/lib/insights-core";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireVenuePermission } from "@/lib/tenant";

/**
 * "Ask your data". Server Functions are reachable by direct POST, so this
 * re-checks the session, the reports:view permission, the plan, and the
 * per-venue rate limit on every call — the panel's disabled states are UI
 * only. The question is sanitised to one bounded line; the model sees the
 * venue's OWN fact sheet and nothing else (no table access, no SQL).
 */
export async function askYourData(rawQuestion: string): Promise<AskInsightsResult> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
  const venue = await requireVenuePermission("reports:view");
  const plan = await getVenuePlan(venue.id);
  if (plan === null || !hasFeature({ plan }, FEATURES.AI_INSIGHTS)) {
    return { ok: false, error: "AI insights are part of the Pro and Scale plans." };
  }
  const question = sanitiseQuestion(rawQuestion);
  if (!question) {
    return { ok: false, error: "Ask a question about your sales first." };
  }
  const limit = await checkRateLimit("aiInsights", venue.id);
  if (!limit.success) {
    return { ok: false, error: "That's a lot of questions for one hour — try again a little later." };
  }
  const facts = await loadInsightsFacts(venue);
  return askInsights(facts, question);
}
