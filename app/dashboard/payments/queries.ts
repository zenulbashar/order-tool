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
