import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { HOLDING_ORDER_STATUSES } from "@/lib/db/order-status";
import { giftCardLedger, giftCards, orders } from "@/lib/db/schema";

/** A gift card row for the owner management list. */
export type GiftCardRow = {
  id: string;
  code: string;
  initialCents: number;
  balanceCents: number;
  status: "active" | "void";
  note: string | null;
  createdAt: Date;
};

/** All of a venue's gift cards, newest first. Venue-scoped (owner surface). */
export async function getVenueGiftCards(
  venueId: string,
): Promise<GiftCardRow[]> {
  return db
    .select({
      id: giftCards.id,
      code: giftCards.code,
      initialCents: giftCards.initialCents,
      balanceCents: giftCards.balanceCents,
      status: giftCards.status,
      note: giftCards.note,
      createdAt: giftCards.createdAt,
    })
    .from(giftCards)
    .where(eq(giftCards.venueId, venueId))
    .orderBy(desc(giftCards.createdAt));
}

/**
 * Resolve an ACTIVE gift card by its code for redemption. Codes are stored
 * uppercased; matching is case-insensitive + trimmed. Returns the card id +
 * cached balance, or null (unknown / void). Venue-scoped.
 */
export async function resolveGiftCardForRedemption(
  venueId: string,
  code: string,
): Promise<{ id: string; balanceCents: number } | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;
  const [card] = await db
    .select({ id: giftCards.id, balanceCents: giftCards.balanceCents })
    .from(giftCards)
    .where(
      and(
        eq(giftCards.venueId, venueId),
        eq(giftCards.code, normalized),
        eq(giftCards.status, "active"),
      ),
    )
    .limit(1);
  return card ?? null;
}

/**
 * Cash a gift card can put toward an order RIGHT NOW = its cached balance minus
 * value that is spoken for but not yet debited. Excludes `excludeOrderId` — the
 * order being recomputed — so re-applying returns its own reservation to the
 * pool first.
 *
 * "Spoken for" is deliberately WIDER than "pending". The debit does not land
 * with the confirmation: the webhook flips status in one auto-committed UPDATE
 * and schedules redeemGiftCardForOrder in a swallowed after(), which then
 * requires status='confirmed' and so can only run AFTER the flip. Counting only
 * pending orders left the card reading as fully available for that whole window
 * — hundreds of milliseconds on the happy path, but up to a day when an after()
 * is dropped and the daily cron is the backstop. Two orders could each be told
 * the full balance was theirs, both be paid, and both debits then clamp at zero
 * (the non-negative CHECK forces GREATEST(balance - cents, 0)), so the overspend
 * was absorbed in silence and the ledger permanently disagreed with the balance.
 *
 * So a reservation counts while the order is retryable (pending/declined) OR
 * live-but-not-yet-debited. The ledger row is the authoritative "this value has
 * actually left the card" signal, which is why its ABSENCE is what keeps the
 * hold in place. A fully refunded order is excluded — its value came back.
 */
export async function getAvailableGiftCardCents(
  cardId: string,
  balanceCents: number,
  excludeOrderId: string,
): Promise<number> {
  const [row] = await db
    .select({
      reserved: sql<number>`coalesce(sum(${orders.giftCardRedeemedCents}), 0)`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.giftCardId, cardId),
        inArray(orders.status, HOLDING_ORDER_STATUSES),
        // …and the debit has not actually landed yet. Once a `redeem` row
        // exists, `balance_cents` already reflects it and counting the
        // reservation as well would double-subtract.
        sql`not exists (
          select 1 from ${giftCardLedger}
           where ${giftCardLedger.orderId} = ${orders.id}
             and ${giftCardLedger.reason} = 'redeem'
        )`,
        ne(orders.id, excludeOrderId),
      ),
    );
  return Math.max(0, balanceCents - Number(row?.reserved ?? 0));
}
