import "server-only";

import { eq } from "drizzle-orm";

import { getPublicFaqs, getPublicMenu, getPublicVenueBySlug } from "@/app/[slug]/queries";
import { canUseConcierge } from "@/lib/concierge";
import { db } from "@/lib/db";
import { venues } from "@/lib/db/schema";
import { getBaseUrl } from "@/lib/url";

import { verifyTwilioSignature } from "./twilio-signature";

/**
 * Shared plumbing for the two voice webhooks: read Twilio's form body, verify
 * its signature against the PUBLIC URL Twilio called (behind Vercel the
 * request URL is not the signed one), and resolve which venue's number was
 * dialled. Everything the agent may speak from is the venue's PUBLIC storefront
 * data — the same reads the storefront makes.
 */

export type VoiceRequest = {
  params: Record<string, string>;
  from: string;
  to: string;
  callSid: string;
  transcript: string;
};

export async function readVoiceRequest(
  request: Request,
  pathname: string,
): Promise<{ ok: true; voice: VoiceRequest } | { ok: false; status: number; reason: string }> {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    return { ok: false, status: 503, reason: "Twilio is not configured." };
  }
  const raw = await request.text();
  const params: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(raw)) params[key] = value;

  // Twilio signs the exact URL it requested, query string included.
  const search = new URL(request.url).search;
  const signedUrl = `${await getBaseUrl()}${pathname}${search}`;
  if (
    !verifyTwilioSignature(
      request.headers.get("x-twilio-signature"),
      signedUrl,
      params,
      authToken,
    )
  ) {
    return { ok: false, status: 403, reason: "Invalid signature." };
  }
  return {
    ok: true,
    voice: {
      params,
      from: params.From ?? "",
      to: params.To ?? "",
      callSid: params.CallSid ?? "",
      transcript: (params.SpeechResult ?? "").trim().slice(0, 600),
    },
  };
}

/**
 * The venue behind a dialled number, with everything the agent needs. Public
 * data only. Null when the number is not assigned, the venue is not live, or
 * its plan does not include the AI concierge (the phone agent is the same
 * capability by voice).
 */
export async function loadVoiceVenue(dialled: string) {
  if (!dialled) return null;
  const [row] = await db
    .select({ slug: venues.slug })
    .from(venues)
    .where(eq(venues.voiceNumber, dialled))
    .limit(1);
  if (!row) return null;
  const venue = await getPublicVenueBySlug(row.slug);
  if (!venue || !venue.isLive) return null;
  if (!(await canUseConcierge(venue))) return null;
  const [menu, faqs] = await Promise.all([getPublicMenu(venue.id), getPublicFaqs(venue.id)]);
  return { venue, menu, faqs };
}
