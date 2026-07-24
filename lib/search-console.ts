import { createSign } from "node:crypto";

/**
 * Google Search Console (Search Analytics API) client — PLATFORM credential.
 *
 * Venue storefronts live under the platform's own domain (prompt2eat.com/<slug>),
 * so the Search Console property belongs to the PLATFORM, not to each venue —
 * owners could never verify it themselves. One service account (added as a
 * restricted user on the property in Search Console) reads search stats for
 * every venue path; venues never connect Google and no venue-supplied value is
 * ever an authorization input.
 *
 * Auth is the service-account JWT grant done directly with node:crypto + fetch
 * (RS256-signed assertion swapped for a ~1h access token) — no googleapis
 * dependency. LAZY + FAIL-SOFT, matching the house contract (getAnthropic,
 * getStripe): nothing reads env at import time, isSearchConsoleConfigured()
 * gates every caller, and the seo-stats cron degrades to a no-op when the
 * credential is absent (dev/preview).
 *
 * Env:
 *  - GSC_CLIENT_EMAIL: the service account's client_email.
 *  - GSC_PRIVATE_KEY: its PEM private key ("\n" escapes tolerated).
 *  - GSC_SITE_URL: the property exactly as registered — "sc-domain:prompt2eat.com"
 *    or a URL-prefix property like "https://prompt2eat.com/".
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const API_BASE = "https://searchconsole.googleapis.com/webmasters/v3";

/** GSC's hard row ceiling per query. */
export const SEARCH_ANALYTICS_ROW_LIMIT = 25000;

type GscCredentials = { clientEmail: string; privateKey: string; siteUrl: string };

function readCredentials(): GscCredentials | null {
  const clientEmail = process.env.GSC_CLIENT_EMAIL;
  const privateKey = process.env.GSC_PRIVATE_KEY;
  const siteUrl = process.env.GSC_SITE_URL;
  if (!clientEmail || !privateKey || !siteUrl) return null;
  // Env dashboards commonly store the PEM with literal "\n" — normalise.
  return { clientEmail, privateKey: privateKey.replace(/\\n/g, "\n"), siteUrl };
}

export function isSearchConsoleConfigured(): boolean {
  return readCredentials() !== null;
}

/* -------------------------------------------------------------------------- */
/* Service-account JWT grant (cached ~1h access token)                         */
/* -------------------------------------------------------------------------- */

const base64url = (value: string): string =>
  Buffer.from(value).toString("base64url");

function mintAssertion(credentials: GscCredentials): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: credentials.clientEmail,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    }),
  );
  const unsigned = `${header}.${claims}`;
  const signature = createSign("RSA-SHA256")
    .update(unsigned)
    .sign(credentials.privateKey)
    .toString("base64url");
  return `${unsigned}.${signature}`;
}

let cachedToken: { token: string; expiresAtMs: number } | null = null;

async function getAccessToken(credentials: GscCredentials): Promise<string> {
  // 5-minute buffer so a token can never expire mid-batch.
  if (cachedToken && cachedToken.expiresAtMs - Date.now() > 5 * 60_000) {
    return cachedToken.token;
  }
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: mintAssertion(credentials),
    }),
  });
  if (!response.ok) {
    // Status only — never echo the response body (it can carry key hints).
    throw new Error(`Search Console token exchange failed (${response.status}).`);
  }
  const payload = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!payload.access_token) {
    throw new Error("Search Console token exchange returned no token.");
  }
  cachedToken = {
    token: payload.access_token,
    expiresAtMs: Date.now() + (payload.expires_in ?? 3600) * 1000,
  };
  return cachedToken.token;
}

/* -------------------------------------------------------------------------- */
/* Search Analytics queries                                                    */
/* -------------------------------------------------------------------------- */

export type SearchAnalyticsRow = {
  /** One entry per requested dimension, in request order. */
  keys?: string[];
  clicks: number;
  impressions: number;
  /** Fraction 0..1 as GSC reports it. */
  ctr: number;
  position: number;
};

type SearchAnalyticsQuery = {
  startDate: string;
  endDate: string;
  dimensions?: string[];
  dimensionFilterGroups?: {
    filters: { dimension: string; operator: string; expression: string }[];
  }[];
  rowLimit?: number;
  startRow?: number;
};

async function querySearchAnalytics(
  body: SearchAnalyticsQuery,
): Promise<SearchAnalyticsRow[]> {
  const credentials = readCredentials();
  if (!credentials) {
    throw new Error("Search Console is not configured.");
  }
  const token = await getAccessToken(credentials);
  const response = await fetch(
    `${API_BASE}/sites/${encodeURIComponent(credentials.siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) {
    throw new Error(`Search Console query failed (${response.status}).`);
  }
  const payload = (await response.json()) as { rows?: SearchAnalyticsRow[] };
  return payload.rows ?? [];
}

/** A calendar date as GSC speaks it (UTC, YYYY-MM-DD). */
export function toGscDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Daily performance for EVERY page of the property in one call (page × date),
 * for the cron to bucket per venue slug. One API call regardless of fleet
 * size; rowLimit is the API ceiling and the caller logs if it is hit.
 */
export function fetchDailyByPage(range: {
  startDate: string;
  endDate: string;
}): Promise<SearchAnalyticsRow[]> {
  return querySearchAnalytics({
    ...range,
    dimensions: ["page", "date"],
    rowLimit: SEARCH_ANALYTICS_ROW_LIMIT,
  });
}

/**
 * Top search queries for ONE venue's storefront path over a range. The page
 * filter is an anchored regex on the path so slug "cafe" can never absorb
 * "/cafe-bar" or a nested page's traffic. Slugs are validated lowercase
 * kebab at onboarding; escaping is defense in depth.
 */
export function fetchTopQueriesForSlug(
  slug: string,
  range: { startDate: string; endDate: string },
  limit = 10,
): Promise<SearchAnalyticsRow[]> {
  const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return querySearchAnalytics({
    ...range,
    dimensions: ["query"],
    dimensionFilterGroups: [
      {
        filters: [
          {
            dimension: "page",
            operator: "includingRegex",
            expression: `^https?://[^/]+/${escaped}(/|$)`,
          },
        ],
      },
    ],
    rowLimit: limit,
  });
}

/**
 * The venue slug a GSC page URL belongs to, or null for non-storefront pages
 * (marketing routes, nested paths are still attributed to their slug's venue;
 * the caller intersects with the real live-slug set, which is what actually
 * decides attribution).
 */
export function slugFromPageUrl(pageUrl: string): string | null {
  try {
    const path = new URL(pageUrl).pathname;
    const [first] = path.split("/").filter(Boolean);
    return first ?? null;
  } catch {
    return null;
  }
}
