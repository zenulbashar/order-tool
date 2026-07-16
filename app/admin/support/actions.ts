"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { platformAuditLog, supportTickets } from "@/lib/db/schema";
import { requirePlatformAdmin } from "@/lib/platform-admin";

/**
 * Mark a mirrored support ticket closed (operator housekeeping — the actual
 * reply happens on the Foundry side via Telegram; this console is visibility +
 * audit). Operator-gated + audited like every admin write.
 */
export async function closeSupportTicket(formData: FormData): Promise<void> {
  const admin = await requirePlatformAdmin();
  const ticketId = String(formData.get("ticketId") ?? "");
  if (!ticketId) return;

  const updated = await db
    .update(supportTickets)
    .set({ status: "closed" })
    .where(eq(supportTickets.id, ticketId))
    .returning({ foundryTicketId: supportTickets.foundryTicketId });

  if (updated.length > 0) {
    await db.insert(platformAuditLog).values({
      actorEmail: admin.email,
      action: "support_ticket_closed",
      detail: `ticket ${updated[0].foundryTicketId}`,
    });
  }

  revalidatePath("/admin/support");
}
