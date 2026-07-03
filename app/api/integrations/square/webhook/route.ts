import { createHmac, timingSafeEqual } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { venueIntegrations } from "@/lib/db/schema";
import { getBaseUrl } from "@/lib/url";

export const runtime = "nodejs";

/**
 * Square webhook — v1 subscribes ONLY to `oauth.authorization.revoked` so a
 * seller pulling the app's access from their Square Dashboard flips the
 * connection to `revoked` immediately (the hub shows Reconnect). Hostile-
 * surface discipline mirrors the Stripe webhooks: the raw body is verified
 * against SQUARE_WEBHOOK_SIGNATURE_KEY (HMAC-SHA256 over notification URL +
 * body, per Square's scheme) on every request; no key ⇒ fail safe and reject.
 * The registered notification URL must be exactly AUTH_URL +
 * /api/integrations/square/webhook for signatures to verify.
 */
export async function POST(request: Request): Promise<Response> {
  const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  if (!key) {
    return new Response("Webhook signature key is not configured.", {
      status: 503,
    });
  }
  const signature = request.headers.get("x-square-hmacsha256-signature");
  if (!signature) {
    return new Response("Missing signature.", { status: 400 });
  }

  const payload = await request.text();
  const notificationUrl = `${await getBaseUrl()}/api/integrations/square/webhook`;
  const expected = createHmac("sha256", key)
    .update(notificationUrl + payload)
    .digest("base64");
  const given = Buffer.from(signature, "utf8");
  const want = Buffer.from(expected, "utf8");
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    return new Response("Invalid signature.", { status: 400 });
  }

  let event: { type?: string; merchant_id?: string };
  try {
    event = JSON.parse(payload) as { type?: string; merchant_id?: string };
  } catch {
    return new Response("Invalid payload.", { status: 400 });
  }

  try {
    if (event.type === "oauth.authorization.revoked" && event.merchant_id) {
      await db
        .update(venueIntegrations)
        .set({
          status: "revoked",
          accessTokenEnc: null,
          refreshTokenEnc: null,
          tokenExpiresAt: null,
          lastError: "Square access was revoked — reconnect from the hub.",
        })
        .where(
          and(
            eq(venueIntegrations.provider, "square"),
            eq(venueIntegrations.providerAccountId, event.merchant_id),
          ),
        );
    }
    // Every other event type is acknowledged so Square stops resending.
  } catch {
    return new Response("Handler error.", { status: 500 });
  }

  return new Response("ok", { status: 200 });
}
