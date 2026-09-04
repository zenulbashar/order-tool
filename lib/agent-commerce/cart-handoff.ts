import { MAX_LINE_QUANTITY } from "@/lib/orders/limits";

/**
 * The cart HANDOFF: how an external agent (via the MCP surface) hands a diner a
 * ready-to-pay basket without ever writing to our database. The agent gets a
 * storefront URL carrying `?cart=<token>`; the storefront seeds its own cart
 * from the token on first load and then reconciles it against the live menu
 * exactly like a returning diner's saved cart — unknown items drop, required
 * choices are enforced, quantities are capped. Prices are NEVER carried: only
 * ids and quantities, so the token can't set an amount. Pure and dependency-
 * free so both the API route and the client cart provider can import it.
 */

export type HandoffLine = {
  itemId: string;
  variantId: string | null;
  selectedOptionIds: string[];
  quantity: number;
};

/** Enough for any real order; also bounds the URL length. */
export const HANDOFF_MAX_LINES = 30;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

type Compact = { i: string; v?: string; o?: string[]; q: number };

function toBase64Url(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(token: string): string | null {
  try {
    const padded = token.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

export function encodeCartHandoff(lines: HandoffLine[]): string {
  const compact: Compact[] = lines.slice(0, HANDOFF_MAX_LINES).map((line) => ({
    i: line.itemId,
    ...(line.variantId ? { v: line.variantId } : {}),
    ...(line.selectedOptionIds.length > 0 ? { o: line.selectedOptionIds } : {}),
    q: line.quantity,
  }));
  return toBase64Url(JSON.stringify(compact));
}

/**
 * Decode a handoff token into lines. Anything malformed yields null; individual
 * bad entries are dropped rather than failing the whole basket. Quantities are
 * clamped to the same cap the cart and placeOrder enforce.
 */
export function decodeCartHandoff(token: string): HandoffLine[] | null {
  if (!token || token.length > 8192) return null;
  const json = fromBase64Url(token);
  if (json === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const lines: HandoffLine[] = [];
  for (const entry of parsed.slice(0, HANDOFF_MAX_LINES)) {
    if (!entry || typeof entry !== "object") continue;
    const { i, v, o, q } = entry as Record<string, unknown>;
    if (typeof i !== "string" || !ID_PATTERN.test(i)) continue;
    const variantId = typeof v === "string" && ID_PATTERN.test(v) ? v : null;
    const selectedOptionIds = Array.isArray(o)
      ? o.filter((id): id is string => typeof id === "string" && ID_PATTERN.test(id))
      : [];
    const quantity =
      typeof q === "number" && Number.isInteger(q) && q > 0
        ? Math.min(q, MAX_LINE_QUANTITY)
        : 1;
    lines.push({ itemId: i, variantId, selectedOptionIds, quantity });
  }
  return lines;
}
