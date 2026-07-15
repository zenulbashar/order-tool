import { desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { giftCards } from "@/lib/db/schema";

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
