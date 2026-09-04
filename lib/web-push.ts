import "server-only";

import webpush from "web-push";

import {
  buildPushPayload,
  type PushPayload,
  type WebPushSubscription,
} from "@/lib/web-push-core";

/**
 * Web Push sender (VAPID). The browser half of "PWA · install + order-ready
 * push": no app store, no Apple/Google gatekeeper — a browser subscription on
 * the owner's phone (new orders) or a diner's phone (order ready). Gated on
 * VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY; unset = no-op, never an error on the
 * money path. Keys are generated once with `npx web-push generate-vapid-keys`.
 */

export function webPushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/** The public key the browser subscribes with (safe to render into a page). */
export function vapidPublicKey(): string | null {
  return webPushConfigured() ? (process.env.VAPID_PUBLIC_KEY as string) : null;
}

export type WebPushOutcome = "sent" | "dead" | "failed" | "unconfigured";

/**
 * Deliver one notification. "dead" means the push service says the
 * subscription is gone (404/410) and the caller should forget it; "failed" is
 * transient and the subscription is kept.
 */
export async function sendWebPush(
  subscription: WebPushSubscription,
  payload: PushPayload,
): Promise<WebPushOutcome> {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return "unconfigured";
  const subject = process.env.VAPID_SUBJECT || "https://prompt2eat.com";
  try {
    await webpush.sendNotification(subscription, buildPushPayload(payload), {
      vapidDetails: { subject, publicKey, privateKey },
      TTL: 60 * 60,
      urgency: "high",
    });
    return "sent";
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    return status === 404 || status === 410 ? "dead" : "failed";
  }
}
