"use server";

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { FEATURES, hasFeature } from "@/lib/billing/plans";
import { getVenuePlan } from "@/lib/billing/queries";
import { buildImagePrompt, parseMarketingRequest } from "@/lib/marketing/core";
import {
  type DraftCopyResult,
  draftMarketingCopy,
  loadMarketingVenue,
} from "@/lib/marketing/generate";
import { type DraftImageResult, draftMarketingImage } from "@/lib/marketing/image";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireVenuePermission, type Venue } from "@/lib/tenant";

const PLAN_ONLY = "The marketing generator is part of the Pro and Scale plans.";

/**
 * Server Functions are reachable by direct POST: session, permission and plan
 * are re-checked on every call. Both actions return drafts only and write
 * nothing to the venue; the image action stores its PNG in the venue's own
 * R2 folder and hands back the URL.
 */
async function requireEntitledVenue(): Promise<Venue | null> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
  const venue = await requireVenuePermission("settings:manage");
  const plan = await getVenuePlan(venue.id);
  return plan !== null && hasFeature({ plan }, FEATURES.AI_MARKETING) ? venue : null;
}

export async function draftCopy(raw: unknown): Promise<DraftCopyResult> {
  const venue = await requireEntitledVenue();
  if (!venue) return { ok: false, error: PLAN_ONLY };
  const parsed = parseMarketingRequest(raw);
  if (!parsed.ok) return { ok: false, error: parsed.error.message };
  const limit = await checkRateLimit("aiCopy", venue.id);
  if (!limit.success) {
    return { ok: false, error: "That's a lot of drafts for one hour. Try again a little later." };
  }
  const brief = await loadMarketingVenue(venue);
  return draftMarketingCopy(brief, parsed.request);
}

export async function draftImage(raw: unknown): Promise<DraftImageResult> {
  const venue = await requireEntitledVenue();
  if (!venue) return { ok: false, error: PLAN_ONLY };
  const parsed = parseMarketingRequest(raw);
  if (!parsed.ok) return { ok: false, error: parsed.error.message };
  const limit = await checkRateLimit("aiImage", venue.id);
  if (!limit.success) {
    return { ok: false, error: "Image drafts are limited per hour. Try again a little later." };
  }
  const brief = await loadMarketingVenue(venue);
  return draftMarketingImage(venue.id, buildImagePrompt(brief, parsed.request));
}
