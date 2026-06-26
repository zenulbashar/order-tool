import { createHash, randomBytes } from "node:crypto";

/**
 * Opaque-token helpers for the customer identity system (#7). Pure crypto, no
 * DB — kept separate from lib/auth.ts (owner Auth.js) so the two identity
 * systems share no code.
 */

/** A URL-safe, 256-bit opaque token — used for both login links and sessions. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * SHA-256 (hex) of a raw token. We persist ONLY this hash; the raw token lives
 * only in the emailed link (login) or the httpOnly cookie (session), so a DB
 * leak yields nothing usable. SHA-256 — not a slow password hash — is the right
 * primitive: the token is a 256-bit high-entropy secret, not a guessable
 * password, so there is nothing to brute-force.
 */
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
