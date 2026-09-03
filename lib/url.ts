import { headers } from "next/headers";

/**
 * Where the app's own absolute URLs come from.
 *
 * This is not just cosmetic. `getBaseUrl()` builds the DINER MAGIC-LINK
 * (`app/[slug]/account/actions.ts`) and the staff INVITE link, and the token in
 * each is a pure bearer credential — whoever opens the URL is signed in. So an
 * origin derived from a request header is an origin an attacker may be able to
 * choose: submit a victim's address with a poisoned `X-Forwarded-Host` and the
 * victim receives a real token pointing at your domain.
 *
 * The 2026-08 security review dropped that as a *finding* (3/10) because Vercel
 * — the only deploy target this repo documents — sets `x-forwarded-host` on its
 * own edge rather than passing a client copy through, and the repo's Auth.js
 * config already depends on that being true. It stayed on the list as a
 * hardening task, because the code did not ENFORCE the assumption: `AUTH_URL` is
 * commented out in `.env.example` and documented as "set once a custom domain is
 * live", so a real production deployment could be running on the header path.
 *
 * The ladder below removes the assumption instead of restating it. Every rung
 * above the last is an ENVIRONMENT value — set by project configuration, not by
 * the request — so the header is reached only where no deployment env exists at
 * all, i.e. local development, which is exactly where it is needed (pointing a
 * phone at a LAN IP).
 *
 *  1. `AUTH_URL` — explicit operator intent. Always wins, and still the
 *     recommended production setting because it is the only rung that follows a
 *     custom domain.
 *  2. `VERCEL_PROJECT_PRODUCTION_URL` on a production deployment — the project's
 *     production domain, from project config.
 *  3. `VERCEL_URL` — this deployment's own URL (previews).
 *  4. The request host — local dev only.
 */

export type BaseUrlEnv = {
  authUrl?: string;
  vercelEnv?: string;
  vercelProjectProductionUrl?: string;
  vercelUrl?: string;
};

export type RequestOrigin = {
  host: string | null;
  proto: string;
};

/** Strip trailing slashes so callers can append a path unconditionally. */
function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Pure resolution of the base URL. Split out from `getBaseUrl` so the ordering
 * — the whole security property — is unit-testable without a request.
 */
export function resolveBaseUrl(
  env: BaseUrlEnv,
  request: RequestOrigin,
): string {
  if (env.authUrl && env.authUrl.length > 0) {
    return trimTrailingSlash(env.authUrl);
  }

  // Production: never the header. VERCEL_PROJECT_PRODUCTION_URL is the project's
  // production domain and comes from project config, so it cannot be influenced
  // by the request. Preferred over VERCEL_URL here because VERCEL_URL is the
  // per-deployment hostname, which would put an unstable
  // `…-abc123.vercel.app` in a customer's email.
  if (
    env.vercelEnv === "production" &&
    env.vercelProjectProductionUrl &&
    env.vercelProjectProductionUrl.length > 0
  ) {
    return `https://${trimTrailingSlash(env.vercelProjectProductionUrl)}`;
  }

  // Any other Vercel deployment (preview): its own URL, also env-provided.
  if (env.vercelUrl && env.vercelUrl.length > 0) {
    return `https://${trimTrailingSlash(env.vercelUrl)}`;
  }

  // Local development. No deployment env exists, so the request is all there is
  // — and there is no attacker between a developer and their own machine.
  if (!request.host) {
    throw new Error(
      "Cannot determine base URL: no AUTH_URL, no Vercel environment, and no host header.",
    );
  }
  return `${request.proto}://${request.host}`;
}

/**
 * Absolute base URL for links this app mails or hands to Stripe (Connect
 * onboarding return/refresh URLs need absolute, publicly-reachable URLs).
 * See `resolveBaseUrl` for the ordering and why it matters.
 */
export async function getBaseUrl(): Promise<string> {
  const headerList = await headers();
  return resolveBaseUrl(
    {
      authUrl: process.env.AUTH_URL,
      vercelEnv: process.env.VERCEL_ENV,
      vercelProjectProductionUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL,
      vercelUrl: process.env.VERCEL_URL,
    },
    {
      host:
        headerList.get("x-forwarded-host") ?? headerList.get("host") ?? null,
      proto: headerList.get("x-forwarded-proto") ?? "https",
    },
  );
}

/**
 * A user-supplied "return here afterwards" value reduced to a SAME-ORIGIN
 * path, or the fallback. Auth.js will happily redirect to whatever
 * `redirectTo` it is handed, so anything that is not a plain absolute path
 * on this site — an external URL, a protocol-relative `//evil`, a
 * backslash trick, a scheme — is dropped rather than followed. Pure.
 */
export function safeReturnPath(value: unknown, fallback = "/"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }
  if (/[\x00-\x1f\s]/.test(value)) return fallback;
  return value;
}
