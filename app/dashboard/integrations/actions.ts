"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { and, eq, inArray } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { integrationJobs, venueIntegrations } from "@/lib/db/schema";
import {
  buildAuthorizeUrl,
  listLocations,
  revokeSquareAccess,
  signOAuthState,
} from "@/lib/integrations/square/oauth";
import { decryptSecret } from "@/lib/crypto";
import { requireVenue, scopedToVenue, type Venue } from "@/lib/tenant";
import { getBaseUrl } from "@/lib/url";
import { idSchema } from "@/lib/validation";

const HUB_PATH = "/dashboard/integrations";

/**
 * Server Functions are reachable via direct POST, so re-check auth on every
 * call before resolving the tenant. Unauthenticated -> /signin; authenticated
 * but no venue yet -> /onboarding (via requireVenue). These redirects throw a
 * control-flow signal, so callers must invoke this OUTSIDE any try/catch.
 */
async function requireVenueForAction(): Promise<Venue> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
  return requireVenue();
}

/** Venue-scoped Square integration row, or null. IDOR-safe by construction. */
async function squareIntegrationFor(venueId: string) {
  const [integration] = await db
    .select()
    .from(venueIntegrations)
    .where(
      and(
        scopedToVenue(venueIntegrations.venueId, venueId),
        eq(venueIntegrations.provider, "square"),
      ),
    )
    .limit(1);
  return integration ?? null;
}

/** Kick off the Square OAuth round-trip (venue-bound signed state). */
export async function connectSquare(): Promise<void> {
  const venue = await requireVenueForAction();
  // Explicit redirect_uri = our callback; must match the Redirect URL registered
  // in the Square Developer Console (`{AUTH_URL}/api/integrations/square/callback`).
  const redirectUri = `${await getBaseUrl()}/api/integrations/square/callback`;
  const url = buildAuthorizeUrl(signOAuthState(venue.id), redirectUri);
  redirect(url);
}

/**
 * Finish (or change) the venue↔location mapping. The submitted id is
 * re-validated against a LIVE ListLocations call on this venue's own tokens —
 * a forged id can never be stored.
 */
export async function mapSquareLocation(formData: FormData): Promise<void> {
  const venue = await requireVenueForAction();
  const parsed = idSchema.safeParse(formData.get("locationId"));
  if (!parsed.success) redirect(`${HUB_PATH}?error=square`);

  const integration = await squareIntegrationFor(venue.id);
  if (!integration?.accessTokenEnc) redirect(`${HUB_PATH}?error=square`);

  try {
    const locations = await listLocations(
      decryptSecret(integration.accessTokenEnc),
    );
    const chosen = locations.find((location) => location.id === parsed.data);
    if (!chosen) {
      redirect(`${HUB_PATH}?error=square`);
    }
    await db
      .update(venueIntegrations)
      .set({
        providerLocationId: chosen.id,
        providerLocationName: chosen.name,
        status: "active",
      })
      .where(eq(venueIntegrations.id, integration.id));
  } catch (error) {
    // redirect() throws its control-flow signal — let it through.
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect(`${HUB_PATH}?error=square`);
  }
  revalidatePath(HUB_PATH);
  redirect(HUB_PATH);
}

/** Pause/resume mirroring (active ↔ disabled). Paused venues enqueue nothing. */
export async function setSquareMirroring(formData: FormData): Promise<void> {
  const venue = await requireVenueForAction();
  const enable = formData.get("enable") === "on";
  const integration = await squareIntegrationFor(venue.id);
  if (!integration) redirect(HUB_PATH);
  // Only flip between owner-controlled states; a revoked grant needs reconnect.
  if (integration.status === "active" || integration.status === "needs_attention") {
    if (!enable) {
      await db
        .update(venueIntegrations)
        .set({ status: "disabled" })
        .where(eq(venueIntegrations.id, integration.id));
    }
  } else if (integration.status === "disabled" && enable) {
    await db
      .update(venueIntegrations)
      .set({ status: integration.providerLocationId ? "active" : "disabled" })
      .where(eq(venueIntegrations.id, integration.id));
  }
  revalidatePath(HUB_PATH);
  redirect(HUB_PATH);
}

/**
 * Disconnect: best-effort revoke on the Square side, then wipe tokens locally.
 * Never deletes the row (history + reconnect land on the same unique key) and
 * never deletes any menu/order data — exactly what the hub's note promises.
 */
export async function disconnectSquare(): Promise<void> {
  const venue = await requireVenueForAction();
  const integration = await squareIntegrationFor(venue.id);
  if (!integration) redirect(HUB_PATH);

  if (integration.providerAccountId) {
    try {
      await revokeSquareAccess(integration.providerAccountId);
    } catch {
      // Best-effort — local disconnect proceeds either way.
    }
  }
  await db
    .update(venueIntegrations)
    .set({
      status: "disabled",
      accessTokenEnc: null,
      refreshTokenEnc: null,
      tokenExpiresAt: null,
      providerLocationId: null,
      providerLocationName: null,
      lastError: null,
      consecutiveFailures: 0,
    })
    .where(eq(venueIntegrations.id, integration.id));
  revalidatePath(HUB_PATH);
  redirect(HUB_PATH);
}

/** Reset one failed/dead job to run again now. Venue-scoped ownership check. */
export async function retrySquareJob(formData: FormData): Promise<void> {
  const venue = await requireVenueForAction();
  const parsed = idSchema.safeParse(formData.get("jobId"));
  if (parsed.success) {
    await db
      .update(integrationJobs)
      .set({ status: "pending", nextAttemptAt: new Date() })
      .where(
        and(
          eq(integrationJobs.id, parsed.data),
          scopedToVenue(integrationJobs.venueId, venue.id),
          inArray(integrationJobs.status, ["failed", "dead"]),
        ),
      );
  }
  revalidatePath(HUB_PATH);
  redirect(`${HUB_PATH}?detail=square`);
}

/** Reset every failed/dead Square job for this venue. */
export async function retryAllSquareJobs(): Promise<void> {
  const venue = await requireVenueForAction();
  await db
    .update(integrationJobs)
    .set({ status: "pending", nextAttemptAt: new Date() })
    .where(
      and(
        scopedToVenue(integrationJobs.venueId, venue.id),
        eq(integrationJobs.provider, "square"),
        inArray(integrationJobs.status, ["failed", "dead"]),
      ),
    );
  revalidatePath(HUB_PATH);
  redirect(`${HUB_PATH}?detail=square`);
}
