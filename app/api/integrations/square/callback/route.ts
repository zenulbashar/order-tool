import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { db } from "@/lib/db";
import { venueIntegrations } from "@/lib/db/schema";
import {
  listLocations,
  obtainToken,
  SQUARE_SCOPES,
  verifyOAuthState,
} from "@/lib/integrations/square/oauth";
import { requireVenue } from "@/lib/tenant";

export const runtime = "nodejs";

const HUB_PATH = "/dashboard/integrations";

/**
 * Square OAuth callback. Double-locked: the `state` must verify (HMAC, venue-
 * bound, 10-min expiry) AND its venue must equal the SESSION's current venue —
 * so neither a forged state nor a signed-but-crossed one can attach a Square
 * grant to a venue the signed-in owner isn't operating. Tokens are encrypted
 * before they touch the database and never logged.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const venue = await requireVenue();

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  // Seller denied the permission form (or Square returned an error).
  if (!code || !state) redirect(`${HUB_PATH}?error=square`);

  const stateVenueId = verifyOAuthState(state);
  if (!stateVenueId || stateVenueId !== venue.id) {
    redirect(`${HUB_PATH}?error=square`);
  }

  try {
    const tokens = await obtainToken(code);
    const locations = (await listLocations(tokens.accessToken)).filter(
      (location) => location.status === "ACTIVE",
    );
    const soleLocation = locations.length === 1 ? locations[0] : null;

    const row = {
      status: soleLocation ? ("active" as const) : ("disabled" as const),
      accessTokenEnc: encryptSecret(tokens.accessToken),
      refreshTokenEnc: encryptSecret(tokens.refreshToken),
      tokenExpiresAt: new Date(tokens.expiresAt),
      tokenRefreshedAt: new Date(),
      providerAccountId: tokens.merchantId,
      providerLocationId: soleLocation?.id ?? null,
      providerLocationName: soleLocation?.name ?? null,
      scopes: SQUARE_SCOPES,
      lastError: null,
      consecutiveFailures: 0,
    };
    await db
      .insert(venueIntegrations)
      .values({ venueId: venue.id, provider: "square", ...row })
      .onConflictDoUpdate({
        target: [venueIntegrations.venueId, venueIntegrations.provider],
        set: row,
      });
  } catch (error) {
    // redirect() below throws its own control-flow signal — this catch only
    // sees real failures (token exchange / locations / DB).
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect(`${HUB_PATH}?error=square`);
  }

  redirect(HUB_PATH);
}
