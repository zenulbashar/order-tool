import { and, count, eq, gt, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { orders, venues } from "@/lib/db/schema";
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

export type PayoutRow = {
  id: string;
  amountCents: number;
  status: string;
  arrivalDate: number | null;
  created: number;
};

export type PayoutSummary = {
  availableCents: number;
  pendingCents: number;
  currency: string;
  payouts: PayoutRow[];
};

/**
 * The connected account's balance + recent payouts, for the Payments "Balance &
 * payouts" KPIs. Read live from Stripe on the venue's OWN connected account (the
 * account id comes from the venue row, never client input). Balance arrays are
 * per-currency; we sum them (AU venues are single-currency). Fail-soft: any
 * Stripe error returns null and the card shows a calm fallback. Read-only.
 */
export async function getPayoutSummary(
  accountId: string,
): Promise<PayoutSummary | null> {
  try {
    const stripe = getStripe();
    const [balance, payouts] = await Promise.all([
      stripe.balance.retrieve({}, { stripeAccount: accountId }),
      stripe.payouts.list({ limit: 5 }, { stripeAccount: accountId }),
    ]);
    const sum = (rows: { amount: number }[]) =>
      rows.reduce((total, row) => total + row.amount, 0);
    return {
      availableCents: sum(balance.available),
      pendingCents: sum(balance.pending),
      currency: (balance.available[0]?.currency ?? "aud").toUpperCase(),
      payouts: payouts.data.map((payout) => ({
        id: payout.id,
        amountCents: payout.amount,
        status: payout.status,
        arrivalDate: payout.arrival_date ?? null,
        created: payout.created,
      })),
    };
  } catch {
    return null;
  }
}

/**
 * Confirmed-order sales for the venue over the last 30 days (gross total +
 * count), from OUR orders table — the money actually taken through the
 * storefront, independent of Stripe's payout timing. Venue-scoped.
 */
export async function getConfirmedSalesSummary(
  venueId: string,
): Promise<{ last30Cents: number; count30: number }> {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${orders.totalCents}), 0)`,
      n: count(),
    })
    .from(orders)
    .where(
      and(
        eq(orders.venueId, venueId),
        eq(orders.status, "confirmed"),
        gt(orders.createdAt, since),
      ),
    );
  return { last30Cents: Number(row?.total ?? 0), count30: Number(row?.n ?? 0) };
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
