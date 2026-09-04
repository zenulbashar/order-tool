import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";

import { db } from "@/lib/db";
import { orderPushSubscriptions, orders, venues } from "@/lib/db/schema";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { webPushConfigured } from "@/lib/web-push";
import {
  acceptsReadySubscription,
  parseWebPushSubscription,
  serialiseWebPushSubscription,
} from "@/lib/web-push-core";

export const runtime = "nodejs";

/**
 * Diner "notify me when it's ready" opt-in (PWA · web push). Anonymous by
 * design — the confirmation page is reachable by its opaque order token alone,
 * and that token is the proof of standing here too: the order is resolved by
 * venue slug + public token, never by id. Only a PAID, still-in-progress order
 * accepts a subscription; a finished or unpaid one has nothing to announce.
 * Per-IP rate-limited (pushIp) like the other anonymous surfaces.
 */
export async function POST(request: Request): Promise<Response> {
  if (!webPushConfigured()) {
    return new Response("Push not configured", { status: 503 });
  }
  const ip = clientIpFromHeaders(await headers());
  const limit = await checkRateLimit("pushIp", ip);
  if (!limit.success) {
    return new Response("Rate limited", { status: 429 });
  }

  let body: { slug?: unknown; token?: unknown; subscription?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response("Invalid body", { status: 400 });
  }
  const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const subscription = parseWebPushSubscription(body.subscription);
  if (!slug || !token || !subscription) {
    return new Response("Invalid input", { status: 400 });
  }

  const [order] = await db
    .select({
      id: orders.id,
      status: orders.status,
      fulfillmentStatus: orders.fulfillmentStatus,
    })
    .from(orders)
    .innerJoin(venues, eq(venues.id, orders.venueId))
    .where(and(eq(venues.slug, slug), eq(orders.publicToken, token)))
    .limit(1);
  if (!order) {
    return new Response("Not found", { status: 404 });
  }
  if (!acceptsReadySubscription(order.status, order.fulfillmentStatus)) {
    return new Response("Order not in progress", { status: 409 });
  }

  try {
    await db
      .insert(orderPushSubscriptions)
      .values({
        orderId: order.id,
        subscription: serialiseWebPushSubscription(subscription),
      })
      .onConflictDoNothing();
  } catch {
    return new Response("Error", { status: 500 });
  }
  return new Response("ok", { status: 200 });
}
