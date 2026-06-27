"use server";

import { eq } from "drizzle-orm";

import { getCustomer } from "@/lib/customer/auth";
import { writeCustomerPrefill } from "@/lib/customer/prefill";
import { db } from "@/lib/db";
import { venues } from "@/lib/db/schema";
import { isReservedSlug } from "@/lib/validation";

/**
 * Remember a GUEST's name + phone on THIS device for next time's checkout
 * pre-fill. Fired fire-and-forget after a successful order, right next to the
 * auto-link claimOrder. Treated as hostile public input (Server Actions are
 * reachable via direct POST): the venue is resolved server-side by slug and the
 * cookie helper trims + caps both fields. It only ever sets a cookie on the
 * caller's own response, so there is no cross-user surface.
 *
 * GUEST-GATED: if a customer session exists for this venue we SKIP — a signed-in
 * customer's checkout already pre-fills from their account record, which takes
 * precedence, so the device cookie would be redundant PII. This writes ONLY a
 * name+phone convenience cookie: NO auth token, NO session, NO history/account
 * access. The firewall is intact — this never imports lib/auth.ts or touches
 * owner tables.
 */
export async function rememberCustomerPrefill(
  slug: string,
  name: string,
  phone: string | null,
): Promise<void> {
  if (isReservedSlug(slug)) return;

  const [venue] = await db
    .select({ id: venues.id })
    .from(venues)
    .where(eq(venues.slug, slug.trim().toLowerCase()))
    .limit(1);
  if (!venue) return;

  // Signed-in => the session pre-fill wins; don't write the device cookie.
  const customer = await getCustomer(venue.id);
  if (customer) return;

  await writeCustomerPrefill(name, phone ?? "");
}
