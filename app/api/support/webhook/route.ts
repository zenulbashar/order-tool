import { createHmac, timingSafeEqual } from "node:crypto";

import { after } from "next/server";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { supportTickets, venues } from "@/lib/db/schema";
import { notifySupportTicketReplied } from "@/lib/support/notify";

// HMAC verification + the Neon pool need Node — keep off the Edge runtime.
export const runtime = "nodejs";

/**
 * Inbound webhook FROM the Foundry support service (docs/ai-support-contract.md
 * §5): `ticket.created` / `ticket.replied`. Treated as a hostile public
 * surface with the same discipline as the Stripe/Square webhooks:
 *
 *  - the RAW body is verified (HMAC-SHA256, timing-safe compare) against
 *    SUPPORT_WEBHOOK_SECRET before any parsing; secret absent ⇒ 503 fail-safe;
 *  - handling is idempotent: upserts keyed on the unique foundry_ticket_id, so
 *    Foundry's retries and out-of-order deliveries are safe;
 *  - unknown event types are acknowledged 200 so the sender stops resending;
 *  - only a persistence failure returns 500 (Foundry retries with backoff).
 */
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.SUPPORT_WEBHOOK_SECRET;
  if (!secret) {
    return new Response("Webhook secret is not configured.", { status: 503 });
  }

  const signature = request.headers.get("x-signature");
  if (!signature) {
    return new Response("Missing signature.", { status: 401 });
  }

  // RAW body — read exactly as received and never parsed before verifying.
  const payload = await request.text();
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const given = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
    return new Response("Invalid signature.", { status: 401 });
  }

  let event: {
    type?: string;
    ticket?: {
      id?: string;
      conversationId?: string;
      tenantId?: string;
      department?: string;
      summary?: string;
      reply?: string;
    };
  };
  try {
    event = JSON.parse(payload);
  } catch {
    return new Response("Invalid payload.", { status: 400 });
  }

  const ticket = event.ticket;
  const isTicketEvent =
    event.type === "ticket.created" || event.type === "ticket.replied";
  if (!isTicketEvent || !ticket?.id || !ticket.tenantId) {
    // Unknown/irrelevant event — acknowledge so Foundry stops resending.
    return new Response("ok", { status: 200 });
  }

  // A forged/foreign tenant id must not 500 (that would cause a retry storm)
  // — a ticket for a venue this platform doesn't know is acknowledged and
  // dropped. The FK would reject it anyway; this makes the drop deliberate.
  const [venue] = await db
    .select({ id: venues.id })
    .from(venues)
    .where(eq(venues.id, ticket.tenantId))
    .limit(1);
  if (!venue) {
    return new Response("ok", { status: 200 });
  }

  const department =
    ticket.department === "sales" || ticket.department === "billing"
      ? ticket.department
      : "tech";
  const summary = (ticket.summary ?? "").slice(0, 2000) || "Support request";
  const reply =
    event.type === "ticket.replied"
      ? (ticket.reply ?? "").slice(0, 5000) || null
      : null;

  try {
    // One upsert covers both events AND out-of-order delivery (a `replied`
    // arriving before its `created` still lands a complete row).
    await db
      .insert(supportTickets)
      .values({
        venueId: venue.id,
        foundryTicketId: ticket.id,
        conversationId: (ticket.conversationId ?? "").slice(0, 128) || "unknown",
        department,
        summary,
        status: event.type === "ticket.replied" ? "replied" : "open",
        reply,
        repliedAt: event.type === "ticket.replied" ? new Date() : null,
      })
      .onConflictDoUpdate({
        target: supportTickets.foundryTicketId,
        set:
          event.type === "ticket.replied"
            ? { status: "replied", reply, repliedAt: new Date() }
            : // A retried `created` for an existing row changes nothing that
              // matters; refresh the summary only (never regress a reply).
              { summary },
      });
  } catch {
    // Persistence failed — 500 so Foundry redelivers.
    return new Response("Handler error.", { status: 500 });
  }

  // Best-effort owner email carrying the reply — isolated in after() so it can
  // never delay or fail the ack (a redelivered webhook would re-send; the email
  // is informational, so that's acceptable).
  if (event.type === "ticket.replied") {
    const foundryTicketId = ticket.id;
    try {
      after(() => notifySupportTicketReplied(foundryTicketId).catch(() => {}));
    } catch {
      // Swallowed by design.
    }
  }

  return new Response("ok", { status: 200 });
}
