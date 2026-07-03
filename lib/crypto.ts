import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

/**
 * Server-only secret encryption for third-party integration credentials
 * (Track 0). AES-256-GCM — authenticated encryption, so a tampered ciphertext
 * fails loudly instead of decrypting to garbage.
 *
 * The key is read LAZILY at first call (never at import), matching the
 * getStripe() / getR2() / Neon-pool contract: `next build` / `tsc` / `eslint`
 * all run with NO env present. INTEGRATION_TOKEN_KEY must be 32 bytes of
 * base64 (`openssl rand -base64 32`).
 *
 * Stored format is versioned for future key/algorithm rotation:
 *   v1.<iv b64url>.<ciphertext b64url>.<auth tag b64url>
 *
 * Plaintext secrets exist only inside the calling function's scope — they are
 * NEVER logged, never persisted, and never included in error messages.
 */

const VERSION = "v1";
const IV_BYTES = 12; // GCM-recommended 96-bit IV
const KEY_BYTES = 32;

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.INTEGRATION_TOKEN_KEY;
  if (!raw) {
    throw new Error(
      "INTEGRATION_TOKEN_KEY is not set — cannot encrypt/decrypt integration secrets.",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      "INTEGRATION_TOKEN_KEY must be 32 bytes of base64 (openssl rand -base64 32).",
    );
  }
  cachedKey = key;
  return key;
}

/** Encrypt a secret for at-rest storage. Never store the plaintext column. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
}

/**
 * Decrypt a stored secret. Throws on unknown version, malformed input, or
 * authentication failure (tampering / wrong key) — callers treat a throw as
 * "credentials unusable", never as a soft empty string.
 */
export function decryptSecret(stored: string): string {
  const [version, ivPart, ciphertextPart, tagPart] = stored.split(".");
  if (version !== VERSION || !ivPart || !ciphertextPart || !tagPart) {
    throw new Error("Unrecognised encrypted-secret format.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivPart, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
