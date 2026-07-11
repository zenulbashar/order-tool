import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { customers, orders, venues } from "@/lib/db/schema";
import { sendSms } from "@/lib/sms";
import { getBaseUrl } from "@/lib/url";

import { sendOrderEmail } from "./email";

/**
 * Customer-facing order notifications (email + SMS). Consent-based and firewalled
 * from the owner side: a notification is sent ONLY to the order's LINKED customer
 * account (orders.customer_id) and ONLY through channels that customer opted into
 * (customers.notify_order_email / notify_order_sms). Guest orders — no linked
 * customer — are never messaged (they weren't opted in and we hold no verified
 * contact for them); they still see the live order page.
 *
 * Entirely BEST-EFFORT: every send is isolated, failures are swallowed, and the
 * whole function is only ever invoked from post-response `after()` blocks — it
 * can never delay or fail order confirmation or the kitchen action. Each channel
 * no-ops when its provider is unconfigured (Resend / Twilio env), so this is safe
 * to ship before either is set up.
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
      orderPhone: orders.customerPhone,
      venueName: venues.name,
      venueSlug: venues.slug,
      email: customers.email,
      customerPhone: customers.phone,
      wantsEmail: customers.notifyOrderEmail,
      wantsSms: customers.notifyOrderSms,
    })
    .from(orders)
    .innerJoin(venues, eq(venues.id, orders.venueId))
    // LEFT join: a guest order (customer_id NULL) yields null customer fields and
    // is skipped below — never messaged.
    .leftJoin(customers, eq(customers.id, orders.customerId))
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!row || !row.email) return; // no linked customer → consent-based skip

  const first = row.customerName.split(" ")[0] || "there";
  const url = `${await getBaseUrl()}/${row.venueSlug}/order/${row.publicToken}`;
  const collect = row.orderType === "dine_in" ? "" : " to collect";

  const subject =
    event === "confirmed"
      ? `Order confirmed — ${row.venueName}`
      : `Your order is ready${collect} — ${row.venueName}`;
  const headline =
    event === "confirmed"
      ? `Thanks ${first}! Your order at ${row.venueName} is confirmed.`
      : `${first}, your order at ${row.venueName} is ready${collect}.`;

  if (row.wantsEmail) {
    try {
      await sendOrderEmail({
        to: row.email,
        subject,
        lines: [headline, "", `Track your order: ${url}`],
      });
    } catch {
      // Best-effort: a failed email must never affect the other channel or path.
    }
  }

  // SMS goes to the customer's saved phone, falling back to the phone left on the
  // order at checkout. No-op when the customer has neither.
  const phone = row.customerPhone ?? row.orderPhone;
  if (row.wantsSms && phone) {
    try {
      await sendSms(phone, `${headline} ${url}`);
    } catch {
      // Best-effort — swallow (also no-ops entirely when Twilio is unconfigured).
    }
  }
}
