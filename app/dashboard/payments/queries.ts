import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { venues } from "@/lib/db/schema";
import { getStripe } from "@/lib/stripe";

export type StripeAccountStatus = {
  accountId: string;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
};

/**
 * Retrieve the live Connect account from Stripe and persist its status onto the
 * venue: charges_enabled gates whether checkout may charge, and onboarded_at is
 * stamped the first time the venue submits its details (COALESCE preserves the
 * original timestamp on later refreshes). Server-side only — the account id is
 * read from the venue row, never from client input.
 */
export async function syncStripeAccountStatus(
  venueId: string,
  accountId: string,
): Promise<StripeAccountStatus> {
  const account = await getStripe().accounts.retrieve(accountId);
  const chargesEnabled = account.charges_enabled ?? false;
  const detailsSubmitted = account.details_submitted ?? false;

  await db
    .update(venues)
    .set({
      stripeChargesEnabled: chargesEnabled,
      ...(detailsSubmitted
        ? { stripeOnboardedAt: sql`COALESCE(${venues.stripeOnboardedAt}, now())` }
        : {}),
    })
    .where(eq(venues.id, venueId));

  return { accountId, chargesEnabled, detailsSubmitted };
}

export type PayToCapability = "active" | "pending" | "inactive" | "unavailable";

/**
 * Live status of the connected account's `payto_payments` capability, for the
 * Payments page badge. "active" ⇒ PayTo shows at checkout; "pending" ⇒ Stripe
 * is still verifying (owner opted in but customers don't see it yet);
 * "unavailable" ⇒ the platform can't offer PayTo (e.g. access not granted) or
 * Stripe is unreachable — treated as a soft, non-alarming state. Read-only.
 */
export async function getPayToCapabilityStatus(
  accountId: string,
): Promise<PayToCapability> {
  try {
    const account = await getStripe().accounts.retrieve(accountId);
    const status = account.capabilities?.payto_payments;
    if (status === "active") return "active";
    if (status === "pending") return "pending";
    if (status === "inactive") return "inactive";
    return "unavailable";
  } catch {
    return "unavailable";
  }
}
