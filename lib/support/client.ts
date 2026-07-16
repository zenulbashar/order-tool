import "server-only";

import { createHmac, createPrivateKey, randomUUID, sign } from "node:crypto";

/**
 * Signed client for the Foundry support API (docs/ai-support-contract.md).
 *
 * The trust model mirrors lib/sso/roster.ts: prompt2eat holds an Ed25519
 * PRIVATE key and mints a short-lived, single-use identity token per request;
 * Foundry pins only the PUBLIC key, so a Foundry compromise can never forge
 * prompt2eat identities. The request body is additionally HMAC-signed with a
 * shared secret so Foundry can verify integrity before parsing.
 *
 * All env is read LAZILY at call time (the getStripe()/getR2() contract), so
 * build/typecheck/lint pass with no env. When SUPPORT_API_URL is unset the
 * chat surface reports "support offline"; the literal value "mock" enables the
 * built-in mock stream (lib/support/mock.ts) so the widget is fully buildable
 * and testable before the Foundry side exists.
 */

const ISSUER = "prompt2eat";
const AUDIENCE = "foundry-support";
const APP_ID = "prompt2eat";
/** Identity tokens live ≤60s — one request's lifetime (contract §2.1). */
const TTL_SECONDS = 60;
/** Bound the CONNECT phase only — cleared once headers arrive so the SSE body
 *  can stream for as long as the route's maxDuration allows. */
const CONNECT_TIMEOUT_MS = 15_000;

/** Sentinel SUPPORT_API_URL value that swaps in the local mock stream. */
export const MOCK_SENTINEL = "mock";

export function getSupportApiUrl(): string | null {
  const raw = process.env.SUPPORT_API_URL?.trim();
  return raw ? raw.replace(/\/$/, "") : null;
}

let cachedKey: ReturnType<typeof createPrivateKey> | null = null;

function getPrivateKey() {
  if (cachedKey) return cachedKey;
  const raw = process.env.SUPPORT_SSO_PRIVATE_KEY;
  if (!raw) {
    throw new Error(
      "SUPPORT_SSO_PRIVATE_KEY is not set — cannot mint the support identity token.",
    );
  }
  // Stored base64-encoded (a PKCS8 Ed25519 PEM survives env storage that way).
  const pem = Buffer.from(raw, "base64").toString("utf8");
  cachedKey = createPrivateKey(pem);
  return cachedKey;
}

function getApiSecret(): string {
  const raw = process.env.SUPPORT_API_SECRET;
  if (!raw) {
    throw new Error(
      "SUPPORT_API_SECRET is not set — cannot sign the support request body.",
    );
  }
  return raw;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export type SupportSubject = {
  role: "owner" | "diner" | "anon";
  /** Stable per-app subject id (the Auth.js user id for owners). */
  id: string;
  /** VERIFIED email (from the magic-link session). */
  email?: string | null;
  name?: string | null;
};

/**
 * Mint the per-request Ed25519 identity token (contract §2.1). Tenancy is
 * carried ONLY here — Foundry derives tenant context from the verified token,
 * never from the request body.
 */
export function mintSupportIdentity(
  tenantId: string,
  subject: SupportSubject,
): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = { alg: "EdDSA", typ: "JWT" };
  const payload = {
    iss: ISSUER,
    aud: AUDIENCE,
    iat: nowSeconds,
    exp: nowSeconds + TTL_SECONDS,
    jti: randomUUID(),
    app_id: APP_ID,
    tenant_id: tenantId,
    subject: {
      role: subject.role,
      id: subject.id,
      email: subject.email ?? undefined,
      name: subject.name ?? undefined,
    },
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(
    JSON.stringify(payload),
  )}`;
  // Ed25519 signs with a null algorithm argument in node:crypto.
  const signature = sign(null, Buffer.from(signingInput), getPrivateKey());
  return `${signingInput}.${base64url(signature)}`;
}

/** HMAC-SHA256 hex over the raw request body (contract §2.2). */
export function signSupportBody(rawBody: string): string {
  return createHmac("sha256", getApiSecret()).update(rawBody).digest("hex");
}

/**
 * Typed upstream error: `retryable` mirrors the house policy (429 / 5xx).
 * The message carries only status — never response bodies or tokens.
 */
export class SupportApiError extends Error {
  readonly status: number;
  readonly retryable: boolean;

  constructor(status: number) {
    super(`Support API responded ${status}.`);
    this.name = "SupportApiError";
    this.status = status;
    this.retryable = status === 429 || status >= 500;
  }
}

export type SupportChatPayload = {
  conversationId: string | null;
  department: "tech" | "sales" | "billing";
  message: string;
  locale?: string;
};

export type SupportFeedbackPayload = {
  conversationId: string;
  rating: "good" | "bad";
  reason?: string;
  comment?: string;
};

/** POST /v1/feedback (contract §8) — one CSAT record per conversation. */
export async function postSupportFeedback(
  tenantId: string,
  subject: SupportSubject,
  payload: SupportFeedbackPayload,
): Promise<void> {
  const base = getSupportApiUrl();
  if (!base || base === MOCK_SENTINEL) {
    throw new Error("Support API is not configured for live calls.");
  }
  const rawBody = JSON.stringify(payload);
  const response = await fetch(`${base}/v1/feedback`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${mintSupportIdentity(tenantId, subject)}`,
      "x-signature": signSupportBody(rawBody),
    },
    body: rawBody,
    signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new SupportApiError(response.status);
  }
}

/**
 * POST /v1/chat and return the upstream Response whose body is the SSE stream
 * (AI SDK UI Message Stream v1 — contract §3). The abort timeout bounds the
 * CONNECT phase only; once headers arrive it is cleared so the stream runs for
 * as long as the calling route allows. Non-2xx throws SupportApiError.
 */
export async function postSupportChat(
  tenantId: string,
  subject: SupportSubject,
  payload: SupportChatPayload,
): Promise<Response> {
  const base = getSupportApiUrl();
  if (!base || base === MOCK_SENTINEL) {
    throw new Error("Support API is not configured for live calls.");
  }

  const rawBody = JSON.stringify(payload);
  const controller = new AbortController();
  const connectTimer = setTimeout(
    () => controller.abort(),
    CONNECT_TIMEOUT_MS,
  );
  try {
    const response = await fetch(`${base}/v1/chat`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${mintSupportIdentity(tenantId, subject)}`,
        "x-signature": signSupportBody(rawBody),
        accept: "text/event-stream",
      },
      body: rawBody,
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok || !response.body) {
      throw new SupportApiError(response.status);
    }
    return response;
  } finally {
    clearTimeout(connectTimer);
  }
}
