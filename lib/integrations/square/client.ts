import "server-only";

/**
 * Minimal Square REST client (Track A). Plain fetch — the surface we use is
 * six endpoints, so a typed thin client beats carrying the full SDK, and it
 * follows the house lazy-env contract (getStripe()/getR2()): NOTHING reads
 * SQUARE_* at import time, so `next build` / `tsc` / `eslint` pass with no
 * env present.
 *
 * No Square-Version header is pinned here in v1: the application's default
 * API version, set when the app is created in the Square Developer Console,
 * governs — pin it there (and mirror it here) once the production app exists.
 */

type SquareEnvConfig = {
  applicationId: string;
  applicationSecret: string;
  baseUrl: string;
};

let cached: SquareEnvConfig | null = null;

export function getSquareConfig(): SquareEnvConfig {
  if (cached) return cached;
  const applicationId = process.env.SQUARE_APPLICATION_ID;
  const applicationSecret = process.env.SQUARE_APPLICATION_SECRET;
  if (!applicationId || !applicationSecret) {
    throw new Error(
      "Square is not configured — set SQUARE_APPLICATION_ID and SQUARE_APPLICATION_SECRET.",
    );
  }
  const environment = process.env.SQUARE_ENVIRONMENT ?? "sandbox";
  cached = {
    applicationId,
    applicationSecret,
    baseUrl:
      environment === "production"
        ? "https://connect.squareup.com"
        : "https://connect.squareupsandbox.com",
  };
  return cached;
}

/**
 * A Square API failure. `retryable` maps HTTP semantics onto the outbox's
 * retry policy: 429/5xx/network → retry with backoff; 4xx → still surfaces
 * as a failed job (the owner sees it), but the message says what to fix.
 * Messages carry Square's error codes/categories only — never tokens or
 * request bodies.
 */
export class SquareApiError extends Error {
  readonly status: number;
  readonly retryable: boolean;

  constructor(status: number, codes: string[]) {
    super(
      `Square API ${status}${codes.length > 0 ? ` (${codes.join(", ")})` : ""}`,
    );
    this.name = "SquareApiError";
    this.status = status;
    this.retryable = status === 429 || status >= 500;
  }
}

type SquareFetchOptions = {
  method?: "GET" | "POST";
  /** Seller OAuth access token (decrypted, function-scope only). */
  accessToken?: string;
  /** OAuth endpoints authenticate with `Client <application secret>` instead. */
  clientAuth?: boolean;
  body?: unknown;
};

export async function squareFetch<T>(
  path: string,
  { method = "GET", accessToken, clientAuth = false, body }: SquareFetchOptions,
): Promise<T> {
  const config = getSquareConfig();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (clientAuth) {
    headers.Authorization = `Client ${config.applicationSecret}`;
  } else if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${config.baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    let codes: string[] = [];
    try {
      const payload = (await response.json()) as {
        errors?: { code?: string; category?: string }[];
      };
      codes = (payload.errors ?? [])
        .map((error) => error.code ?? error.category ?? "")
        .filter((code) => code.length > 0)
        .slice(0, 3);
    } catch {
      // Non-JSON error body — status alone is the signal.
    }
    throw new SquareApiError(response.status, codes);
  }

  return (await response.json()) as T;
}
