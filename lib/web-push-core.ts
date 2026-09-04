/**
 * Pure helpers for Web Push (the PWA half of "PWA · install + order-ready
 * push"). A browser's PushSubscription is stored as its JSON — endpoint plus
 * the two client keys — and must be validated before anything is sent to it,
 * because the JSON arrives from the browser (owner devices) or an anonymous
 * diner. Dependency-free so the shape rules are unit-tested.
 */

export type WebPushSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

const KEY_PATTERN = /^[A-Za-z0-9_-]{16,512}$/;

/** A stored push_tokens.token is a Web Push subscription when it parses as one. */
export function parseWebPushSubscription(raw: unknown): WebPushSubscription | null {
  let value: unknown = raw;
  if (typeof raw === "string") {
    if (raw.length > 4096) return null;
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const { endpoint, keys } = value as { endpoint?: unknown; keys?: unknown };
  if (typeof endpoint !== "string") return null;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (!keys || typeof keys !== "object") return null;
  const { p256dh, auth } = keys as { p256dh?: unknown; auth?: unknown };
  if (typeof p256dh !== "string" || !KEY_PATTERN.test(p256dh)) return null;
  if (typeof auth !== "string" || !KEY_PATTERN.test(auth)) return null;
  return { endpoint, keys: { p256dh, auth } };
}

/** Canonical stored form — stable key order so the unique index dedupes. */
export function serialiseWebPushSubscription(sub: WebPushSubscription): string {
  return JSON.stringify({
    endpoint: sub.endpoint,
    keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
  });
}

export type PushPayload = { title: string; body: string; url: string; tag?: string };

/** What the service worker shows. Bounded so a payload never exceeds push limits. */
export function buildPushPayload(input: PushPayload): string {
  return JSON.stringify({
    title: input.title.slice(0, 80),
    body: input.body.slice(0, 200),
    url: input.url.slice(0, 512),
    ...(input.tag ? { tag: input.tag.slice(0, 64) } : {}),
  });
}

/**
 * Whether an order may still take an "order ready" subscription: it must be
 * paid (a partial refund keeps a live order) and the kitchen must not have
 * reached "ready" yet — after that there is nothing left to announce.
 */
export function acceptsReadySubscription(
  status: string,
  fulfillmentStatus: string,
): boolean {
  const paid = status === "confirmed" || status === "partially_refunded";
  const inProgress = fulfillmentStatus !== "ready" && fulfillmentStatus !== "completed";
  return paid && inProgress;
}
