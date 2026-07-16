import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";

import { StatusBadge } from "@/app/_components/status-badge";
import { db } from "@/lib/db";
import { supportTickets, venues } from "@/lib/db/schema";
import { requirePlatformAdmin } from "@/lib/platform-admin";

import { closeSupportTicket } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Support · admin" };

const eyebrow =
  "font-mono text-[9px] font-bold uppercase tracking-wider text-label";

const DEPARTMENT_LABEL: Record<string, string> = {
  tech: "Tech Support",
  sales: "Sales",
  billing: "Billing",
};

function fmtWhen(d: Date): string {
  return d.toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Operator queue for AI-support escalations (docs/ai-support-chat-plan.md §4
 * P3). Tickets are raised by the Foundry support agent and mirrored here via
 * the signed webhook; the operator is notified + replies over Foundry's
 * Telegram channel — this console is the audit/visibility surface (and where
 * a handled ticket is marked closed). Cross-venue read is intentional and
 * confined to the operator-gated /admin scope, like /admin/stats.
 */
export default async function AdminSupportPage() {
  await requirePlatformAdmin();

  const tickets = await db
    .select({
      id: supportTickets.id,
      foundryTicketId: supportTickets.foundryTicketId,
      department: supportTickets.department,
      summary: supportTickets.summary,
      status: supportTickets.status,
      reply: supportTickets.reply,
      createdAt: supportTickets.createdAt,
      repliedAt: supportTickets.repliedAt,
      venueName: venues.name,
    })
    .from(supportTickets)
    .innerJoin(venues, eq(venues.id, supportTickets.venueId))
    .orderBy(desc(supportTickets.createdAt))
    .limit(200);

  const open = tickets.filter((ticket) => ticket.status === "open").length;

  return (
    <main className="mx-auto max-w-5xl px-5 py-8">
      <header className="mb-6">
        <p className={eyebrow}>Support</p>
        <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-ink">
          Escalated tickets
        </h1>
        <p className="mt-1 text-sm text-muted">
          Raised by the support agent when it can&rsquo;t resolve a chat.
          Replies happen in Foundry (Telegram); owners are emailed
          automatically when a ticket is answered.{" "}
          <span className="font-semibold text-ink">{open} open</span>
        </p>
      </header>

      {tickets.length === 0 ? (
        <p className="rounded-card border border-dashed border-line p-10 text-center text-sm text-muted">
          No tickets yet — the support agent hasn&rsquo;t escalated anything.
        </p>
      ) : (
        <ul className="space-y-3">
          {tickets.map((ticket) => (
            <li
              key={ticket.id}
              className="rounded-card border border-line bg-surface-elevated p-4 shadow-card"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink">
                    {ticket.venueName}
                  </span>
                  <span className="rounded-sm bg-sand px-1.5 py-0.5 text-xs font-medium text-ink">
                    {DEPARTMENT_LABEL[ticket.department] ?? ticket.department}
                  </span>
                  <StatusBadge
                    tone={
                      ticket.status === "open"
                        ? "new"
                        : ticket.status === "replied"
                          ? "ready"
                          : "done"
                    }
                  >
                    {ticket.status}
                  </StatusBadge>
                </div>
                <span className="font-mono text-[11px] text-muted">
                  {fmtWhen(ticket.createdAt)} · {ticket.foundryTicketId}
                </span>
              </div>

              <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink">
                {ticket.summary}
              </p>

              {ticket.reply ? (
                <div className="mt-2 rounded-control border border-line bg-surface px-3 py-2">
                  <p className={eyebrow}>
                    Reply{ticket.repliedAt ? ` · ${fmtWhen(ticket.repliedAt)}` : ""}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink">
                    {ticket.reply}
                  </p>
                </div>
              ) : null}

              {ticket.status !== "closed" ? (
                <form action={closeSupportTicket} className="mt-3">
                  <input type="hidden" name="ticketId" value={ticket.id} />
                  <button
                    type="submit"
                    className="rounded-control border border-line-strong bg-surface-elevated px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-hover-secondary"
                  >
                    Mark closed
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
