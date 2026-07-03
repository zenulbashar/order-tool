import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { getSquareConfig, squareFetch } from "./client";

/**
 * Square seller OAuth (Track A). Confidential-client code flow — PKCE is for
 * public clients (§2A of the plan). Scopes are ALWAYS explicit (omitting
 * `scope` applies Square's unrelated default list): the minimal set for
 * creating orders, recording external payments, and listing locations.
 */

export const SQUARE_SCOPES =
  "ORDERS_WRITE ORDERS_READ PAYMENTS_WRITE PAYMENTS_READ MERCHANT_PROFILE_READ";

const STATE_TTL_MS = 10 * 60 * 1000;

/**
 * CSRF/venue-swap protection for the OAuth round-trip: a venue-bound,
 * expiring, HMAC-signed state (key = INTEGRATION_TOKEN_KEY, reused — it is
 * exactly the integrations-secrets key). The callback ALSO re-checks that the
 * signed venue matches the session's current venue, so a signed-but-stale
 * state can't attach a grant to the wrong venue.
 */
export function signOAuthState(venueId: string): string {
  const payload = `${venueId}|${Date.now() + STATE_TTL_MS}|${randomBytes(8).toString("base64url")}`;
  const encoded = Buffer.from(payload, "utf8").toString("base64url");
  return `${encoded}.${hmac(encoded)}`;
}

/** Returns the venueId the state was minted for, or null when invalid/expired. */
export function verifyOAuthState(state: string): string | null {
  const [encoded, signature] = state.split(".");
  if (!encoded || !signature) return null;
  const expected = hmac(encoded);
  const given = Buffer.from(signature, "utf8");
  const want = Buffer.from(expected, "utf8");
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    return null;
  }
  const [venueId, expiry] = Buffer.from(encoded, "base64url")
    .toString("utf8")
    .split("|");
  if (!venueId || !expiry || Number(expiry) < Date.now()) return null;
  return venueId;
}

function hmac(input: string): string {
  const key = process.env.INTEGRATION_TOKEN_KEY;
  if (!key) {
    throw new Error("INTEGRATION_TOKEN_KEY is not set — cannot sign OAuth state.");
  }
  return createHmac("sha256", Buffer.from(key, "base64"))
    .update(input)
    .digest("base64url");
}

export function buildAuthorizeUrl(state: string): string {
  const config = getSquareConfig();
  const params = new URLSearchParams({
    client_id: config.applicationId,
    scope: SQUARE_SCOPES,
    state,
    session: "false",
  });
  return `${config.baseUrl}/oauth2/authorize?${params.toString()}`;
}

export type SquareTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISO 8601 from Square
  merchantId: string;
};

type ObtainTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  merchant_id: string;
};

export async function obtainToken(code: string): Promise<SquareTokens> {
  const config = getSquareConfig();
  const response = await squareFetch<ObtainTokenResponse>("/oauth2/token", {
    method: "POST",
    body: {
      client_id: config.applicationId,
      client_secret: config.applicationSecret,
      grant_type: "authorization_code",
      code,
    },
  });
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    expiresAt: response.expires_at,
    merchantId: response.merchant_id,
  };
}

/**
 * Refresh a 30-day access token. Code-flow refresh tokens are stable (no
 * rotation), but Square may return one anyway — persist whatever comes back.
 */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<SquareTokens> {
  const config = getSquareConfig();
  const response = await squareFetch<ObtainTokenResponse>("/oauth2/token", {
    method: "POST",
    body: {
      client_id: config.applicationId,
      client_secret: config.applicationSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    },
  });
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token ?? refreshToken,
    expiresAt: response.expires_at,
    merchantId: response.merchant_id,
  };
}

/**
 * Revoke the app's grant for a seller (Disconnect). Best-effort: uses the
 * `Client <application secret>` auth scheme; revokes ALL tokens for the
 * merchant so nothing lingers.
 */
export async function revokeSquareAccess(merchantId: string): Promise<void> {
  const config = getSquareConfig();
  await squareFetch("/oauth2/revoke", {
    method: "POST",
    clientAuth: true,
    body: { client_id: config.applicationId, merchant_id: merchantId },
  });
}

export type SquareLocation = { id: string; name: string; status: string };

type ListLocationsResponse = {
  locations?: { id: string; name?: string; status?: string }[];
};

export async function listLocations(
  accessToken: string,
): Promise<SquareLocation[]> {
  const response = await squareFetch<ListLocationsResponse>("/v2/locations", {
    accessToken,
  });
  return (response.locations ?? []).map((location) => ({
    id: location.id,
    name: location.name ?? location.id,
    status: location.status ?? "ACTIVE",
  }));
}
