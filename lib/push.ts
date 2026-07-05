import "server-only";

import { createSign } from "node:crypto";

import { eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { orders, pushTokens, venues } from "@/lib/db/schema";
import { formatCents } from "@/lib/validation";

/**
 * Native-app push (new-order alerts). Sends via Firebase Cloud Messaging HTTP
 * v1 — one FCM project fans out to both Android (FCM) and iOS (APNs configured
 * inside Firebase). NO Firebase SDK: the service-account OAuth token is minted
 * with node:crypto and cached for its lifetime.
 *
 * FAIL-SAFE by construction: with no FCM_* credentials this module is a complete
 * no-op, so `notifyNewOrder` can be called from the order webhook (the money
 * path) without any risk — exactly like the other swallowed after() touches.
 *
 * Required env to activate (all three): FCM_PROJECT_ID, FCM_CLIENT_EMAIL,
 * FCM_PRIVATE_KEY (the service-account private key; literal "\n" newlines OK).
 */

type FcmConfig = { projectId: string; clientEmail: string; privateKey: string };

function fcmConfig(): FcmConfig | null {
  const projectId = process.env.FCM_PROJECT_ID;
  const clientEmail = process.env.FCM_CLIENT_EMAIL;
  const privateKey = process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey };
}

// Cached service-account access token (valid ~1h). Module scope is fine — the
// token is not user-specific.
let cachedToken: { value: string; expiresAt: number } | null = null;

function b64url(input: string): string {
  return Buffer.from(input).toString("base64url");
}

async function accessToken(cfg: FcmConfig): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + 60) return cachedToken.value;

  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: cfg.clientEmail,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const signingInput = `${header}.${claim}`;

  let jwt: string;
  try {
    const signer = createSign("RSA-SHA256");
    signer.update(signingInput);
    jwt = `${signingInput}.${signer.sign(cfg.privateKey).toString("base64url")}`;
  } catch {
    return null; // malformed key
  }

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!json.access_token) return null;
    cachedToken = {
      value: json.access_token,
      expiresAt: now + (json.expires_in ?? 3600),
    };
    return json.access_token;
  } catch {
    return null;
  }
}

/** Register (or re-home) a device token for a venue. Idempotent on the token. */
export async function registerPushToken(
  venueId: string,
  token: string,
  platform: "ios" | "android" | "web",
): Promise<void> {
  await db
    .insert(pushTokens)
    .values({ venueId, token, platform })
    .onConflictDoUpdate({
      target: pushTokens.token,
      set: { venueId, platform, updatedAt: new Date() },
    });
}

/**
 * Send a "new order" push to a venue's registered devices. Resolves the order
 * by PaymentIntent id (never a client value) and only notifies for a confirmed
 * order. Dead tokens (FCM 404/410 UNREGISTERED) are pruned. Never throws.
 */
export async function notifyNewOrder(paymentIntentId: string): Promise<void> {
  const cfg = fcmConfig();
  if (!cfg) return; // push not configured — complete no-op

  try {
    const [order] = await db
      .select({
        venueId: orders.venueId,
        orderType: orders.orderType,
        tableLabel: orders.tableLabel,
        totalCents: orders.totalCents,
        status: orders.status,
        pushNewOrders: venues.pushNewOrders,
      })
      .from(orders)
      .innerJoin(venues, eq(venues.id, orders.venueId))
      .where(eq(orders.stripePaymentIntentId, paymentIntentId))
      .limit(1);
    if (!order || order.status !== "confirmed") return;
    if (!order.pushNewOrders) return; // venue turned new-order alerts off

    const rows = await db
      .select({ token: pushTokens.token })
      .from(pushTokens)
      .where(eq(pushTokens.venueId, order.venueId));
    if (rows.length === 0) return;

    const accessTok = await accessToken(cfg);
    if (!accessTok) return;

    const where =
      order.orderType === "dine_in"
        ? `Table ${order.tableLabel ?? "—"}`
        : "Pickup";
    const body = `${where} · $${formatCents(order.totalCents)}`;

    const dead: string[] = [];
    await Promise.all(
      rows.map(async (row) => {
        try {
          const res = await fetch(
            `https://fcm.googleapis.com/v1/projects/${cfg.projectId}/messages:send`,
            {
              method: "POST",
              headers: {
                authorization: `Bearer ${accessTok}`,
                "content-type": "application/json",
              },
              body: JSON.stringify({
                message: {
                  token: row.token,
                  notification: { title: "New order", body },
                  data: { kind: "new_order" },
                },
              }),
            },
          );
          if (res.status === 404 || res.status === 410) dead.push(row.token);
        } catch {
          // Transient network error — keep the token; a later order retries.
        }
      }),
    );

    if (dead.length > 0) {
      await db.delete(pushTokens).where(inArray(pushTokens.token, dead));
    }
  } catch {
    // Push is best-effort and must never affect the caller (money path).
  }
}
