import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { supportTickets, users, venueMembers, venues } from "@/lib/db/schema";

/**
 * Owner notification for a replied support ticket (docs/ai-support-chat-plan.md
 * §4 P3). When Foundry's operator answers a ticket (ticket.replied webhook),
 * the venue's OWNER gets a plain-text email carrying the reply, so they don't
 * need the chat window open ("you'll get a reply by email").
 *
 * BEST-EFFORT by contract: a silent no-op when RESEND_API_KEY / EMAIL_FROM are
 * unset (parity with the SMS/push paths), invoked only from the webhook's
 * isolated after() block — it can never delay or fail the webhook ack. Uses
 * the same Resend REST pattern as lib/customer/email.ts but deliberately does
 * NOT import that module (it belongs to the firewalled customer flow).
 */
export async function notifySupportTicketReplied(
  foundryTicketId: string,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return; // notification channel unconfigured — no-op

  const [ticket] = await db
    .select({
      venueId: supportTickets.venueId,
      summary: supportTickets.summary,
      reply: supportTickets.reply,
      venueName: venues.name,
    })
    .from(supportTickets)
    .innerJoin(venues, eq(venues.id, supportTickets.venueId))
    .where(eq(supportTickets.foundryTicketId, foundryTicketId))
    .limit(1);
  if (!ticket || !ticket.reply) return;

  // The venue's owner (oldest owner membership wins — the founder account).
  const [owner] = await db
    .select({ email: users.email })
    .from(venueMembers)
    .innerJoin(users, eq(users.id, venueMembers.userId))
    .where(
      and(
        eq(venueMembers.venueId, ticket.venueId),
        eq(venueMembers.role, "owner"),
      ),
    )
    .orderBy(asc(venueMembers.createdAt))
    .limit(1);
  if (!owner?.email) return;

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: owner.email,
        subject: `Support reply — ${ticket.venueName}`,
        text: [
          "Our team replied to your support request:",
          "",
          `> ${ticket.summary}`,
          "",
          ticket.reply,
          "",
          "You can also reopen the Support chat from your dashboard to continue.",
        ].join("\n"),
      }),
    });
  } catch {
    // Best-effort — a failed email never surfaces anywhere.
  }
}
