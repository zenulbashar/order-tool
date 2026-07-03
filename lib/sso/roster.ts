import "server-only";

import { createPrivateKey, randomUUID, sign } from "node:crypto";

/**
 * Roster SSO — the prompt2eat side of a SIGNED ONE-TIME HANDOFF (Track C).
 *
 * The identity firewall holds ACROSS apps, not just within prompt2eat: we do
 * NOT share a session cookie, a user table, or a secret with Roster. We mint a
 * short-lived, single-use, asymmetrically-SIGNED token (EdDSA / Ed25519) that
 * Roster verifies with our PUBLIC key and then provisions-or-matches the user
 * BY VERIFIED EMAIL, creating its OWN Auth.js session. A Roster compromise
 * cannot mint p2e-trusted tokens (it holds only the public key), and rotation
 * is one-sided.
 *
 * Hand-rolled JWS with node:crypto (Ed25519) — no new dependency, and the key
 * is read LAZILY at call time so `next build` / `tsc` / `eslint` run with no
 * env present (the getStripe()/getR2() contract). The token is minted in a
 * server action and POSTed to Roster from the browser as a form field — never
 * a query string — so it never lands in a URL, referrer, or access log.
 */

const ISSUER = "prompt2eat";
const AUDIENCE = "roster";
/** Tokens live ≤60s — just long enough for the redirect + verification. */
const TTL_SECONDS = 60;

const DEFAULT_ROSTER_SSO_URL = "https://roster.zaleit.com.au/api/sso/prompt2eat";

/** The Roster endpoint the browser POSTs the handoff token to. */
export function getRosterSSOUrl(): string {
  return process.env.ROSTER_SSO_URL ?? DEFAULT_ROSTER_SSO_URL;
}

let cachedKey: ReturnType<typeof createPrivateKey> | null = null;

function getPrivateKey() {
  if (cachedKey) return cachedKey;
  const raw = process.env.ROSTER_SSO_PRIVATE_KEY;
  if (!raw) {
    throw new Error(
      "ROSTER_SSO_PRIVATE_KEY is not set — cannot mint the Roster SSO token.",
    );
  }
  // Stored base64-encoded (a PKCS8 Ed25519 PEM survives env storage that way).
  const pem = Buffer.from(raw, "base64").toString("utf8");
  cachedKey = createPrivateKey(pem);
  return cachedKey;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export type RosterHandoffClaims = {
  /** The VERIFIED owner email (from the Auth.js magic-link session). */
  email: string;
  /** Display name, best-effort (for Roster's greeting only). */
  name?: string | null;
  /**
   * Venue CONTEXT for display/prefill only. Per decision D5 (email-level
   * linking), Roster must NOT treat this as an organisation key — it exists so
   * a later venue↔org mapping needs no token redesign.
   */
  venue: { id: string; slug: string; name: string };
  /**
   * Whether this venue has the Roster add-on (Build 5 consolidated billing
   * sets it; false until then). Roster decides what a false claim means
   * (trial / read-only / prompt to subscribe) — its own policy.
   */
  rosterEntitled: boolean;
};

/**
 * Mint a signed one-time handoff token. jti is a fresh UUID so Roster can
 * enforce single use (replay protection is the Roster side's duty — it records
 * consumed jtis). Not called during React render, so Date.now() is fine here.
 */
export function mintRosterHandoffToken(claims: RosterHandoffClaims): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = { alg: "EdDSA", typ: "JWT" };
  const payload = {
    iss: ISSUER,
    aud: AUDIENCE,
    iat: nowSeconds,
    exp: nowSeconds + TTL_SECONDS,
    jti: randomUUID(),
    email: claims.email,
    name: claims.name ?? undefined,
    venue: claims.venue,
    entitlements: { roster: claims.rosterEntitled },
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(
    JSON.stringify(payload),
  )}`;
  // Ed25519 signs with a null algorithm argument in node:crypto.
  const signature = sign(null, Buffer.from(signingInput), getPrivateKey());
  return `${signingInput}.${base64url(signature)}`;
}
