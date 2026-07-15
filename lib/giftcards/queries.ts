import { and, desc, eq, ne, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { giftCards, orders } from "@/lib/db/schema";

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
 * value already reserved on OTHER pending orders (a reservation is the
 * gift_card_redeemed_cents on a pending order; the matching ledger debit is only
 * written at confirmation). Excludes `excludeOrderId` — the order being
 * recomputed — so re-applying returns its own reservation to the pool first.
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
        eq(orders.status, "pending_payment"),
        ne(orders.id, excludeOrderId),
      ),
    );
  return Math.max(0, balanceCents - Number(row?.reserved ?? 0));
}
