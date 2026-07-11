import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { customers, orderItems, orders, venues } from "@/lib/db/schema";
import { sendSms, toE164 } from "@/lib/sms";
import { getBaseUrl } from "@/lib/url";
import { formatCents, orderReference } from "@/lib/validation";
import { sendWhatsApp, whatsAppConfigured } from "@/lib/whatsapp";

import { sendOrderEmail } from "./email";
import { renderOrderEmail } from "./order-email";

/**
 * Customer-facing order notifications (email + text). Contact + consent resolve
 * in this order:
 *  - a LINKED customer account (orders.customer_id) is messaged per THEIR opt-ins
 *    (notify_order_email / notify_order_sms) using their saved email/phone;
 *  - a GUEST order (no account) is messaged on the transactional contact captured
 *    at checkout — email is required there, phone optional — since they gave it
 *    for exactly this purpose.
 *
 * The text channel prefers WhatsApp (approved templates) when configured and
 * falls back to SMS. Entirely BEST-EFFORT: every send is isolated + swallowed,
 * each channel no-ops when its provider is unconfigured, and this is only ever
 * invoked from post-response `after()` blocks — it can never delay or fail order
 * confirmation or the kitchen action.
 */
export type OrderEvent = "confirmed" | "ready";

export async function notifyCustomerOrder(
  orderId: string,
  event: OrderEvent,
): Promise<void> {
  const [row] = await db
    .select({
      publicToken: orders.publicToken,
      orderType: orders.orderType,
      customerName: orders.customerName,
      orderEmail: orders.customerEmail,
      orderPhone: orders.customerPhone,
      totalCents: orders.totalCents,
      venueName: venues.name,
      venueSlug: venues.slug,
      // Linked-account fields (null for a guest order).
      acctEmail: customers.email,
      acctPhone: customers.phone,
      wantsEmail: customers.notifyOrderEmail,
      wantsSms: customers.notifyOrderSms,
      hasAccount: customers.id,
    })
    .from(orders)
    .innerJoin(venues, eq(venues.id, orders.venueId))
    .leftJoin(customers, eq(customers.id, orders.customerId))
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!row) return;

  // Resolve recipients + consent. Account: respect the toggles. Guest: use the
  // checkout contact (they provided it for order updates).
  const emailTo = row.hasAccount
    ? row.wantsEmail
      ? row.acctEmail
      : null
    : row.orderEmail;
  const phoneRaw = row.hasAccount
    ? row.wantsSms
      ? (row.acctPhone ?? row.orderPhone)
      : null
    : row.orderPhone;

  if (!emailTo && !phoneRaw) return; // nothing to send

  const first = row.customerName.split(" ")[0] || "there";
  const reference = orderReference(row.publicToken);
  const url = `${await getBaseUrl()}/${row.venueSlug}/order/${row.publicToken}`;
  const collect = row.orderType === "dine_in" ? "" : " to collect";

  // ---- Email (rich, itemised) ----
  if (emailTo) {
    try {
      const items = await db
        .select({
          name: orderItems.itemNameSnapshot,
          variantName: orderItems.variantNameSnapshot,
          quantity: orderItems.quantity,
          lineTotalCents: orderItems.lineTotalCents,
        })
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId))
        .orderBy(asc(orderItems.createdAt));

      const { subject, html, text } = renderOrderEmail({
        event,
        venueName: row.venueName,
        firstName: first,
        reference,
        orderType: row.orderType,
        items,
        totalCents: row.totalCents,
        url,
      });
      await sendOrderEmail({ to: emailTo, subject, html, text });
    } catch {
      // Best-effort: a failed email never affects the text channel or the path.
    }
  }

  // ---- Text: WhatsApp preferred, SMS fallback ----
  const phone = phoneRaw ? toE164(phoneRaw) : null;
  if (phone) {
    try {
      if (whatsAppConfigured(event)) {
        await sendWhatsApp(phone, event, {
          "1": first,
          "2": row.venueName,
          "3": reference,
          "4": url,
        });
      } else {
        const body =
          event === "confirmed"
            ? `${row.venueName}: order ${reference} confirmed — $${formatCents(row.totalCents)}. Track: ${url}`
            : `${row.venueName}: order ${reference} is ready${collect}. ${url}`;
        await sendSms(phone, body);
      }
    } catch {
      // Best-effort — swallow (each channel also no-ops when unconfigured).
    }
  }
}
