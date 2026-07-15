import "server-only";

import { randomInt } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { giftCardLedger, giftCards } from "@/lib/db/schema";

/**
 * Owner-side gift-card management (redeem-only v1). Issuing, topping up, and
 * voiding cards. Every value change writes an append-only gift_card_ledger row
 * AND bumps the card's cached balance_cents in the SAME transaction, so the
 * cached balance can never drift from its history. Redemption (which debits a
 * card when a diner spends it) lands in PR2 and rides the checkout recompute —
 * this module never touches the order money-path.
 */

// Unambiguous alphabet — no I/L/O/0/1 — so a printed/spoken code isn't misread.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_GROUPS = 3;
const CODE_GROUP_LEN = 4;

/** A human-friendly bearer code like "A7KP-3RNM-9QTX". */
export function generateGiftCardCode(): string {
  const groups: string[] = [];
  for (let g = 0; g < CODE_GROUPS; g += 1) {
    let group = "";
    for (let i = 0; i < CODE_GROUP_LEN; i += 1) {
      group += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    }
    groups.push(group);
  }
  return groups.join("-");
}

export type IssueResult =
  | { ok: true; id: string; code: string }
  | { ok: false };

/**
 * Issue a new gift card with an opening balance. Retries on the (rare) code
 * collision against the per-venue unique index. The card row and its opening
 * `issue` ledger entry are written in one transaction, with balance_cents ==
 * the issued amount (so balance == SUM(ledger) from the first row).
 */
export async function issueGiftCard(
  venueId: string,
  amountCents: number,
  note?: string | null,
): Promise<IssueResult> {
  if (!Number.isInteger(amountCents) || amountCents <= 0) return { ok: false };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateGiftCardCode();
    try {
      const result = await db.transaction(async (tx) => {
        const [card] = await tx
          .insert(giftCards)
          .values({
            venueId,
            code,
            initialCents: amountCents,
            balanceCents: amountCents,
            note: note?.trim() || null,
          })
          .returning({ id: giftCards.id });
        await tx.insert(giftCardLedger).values({
          venueId,
          giftCardId: card.id,
          deltaCents: amountCents,
          reason: "issue",
        });
        return card.id;
      });
      return { ok: true, id: result, code };
    } catch {
      // Almost certainly a code collision — try a fresh code. Any other error
      // also just fails the issue (nothing partial is written — it's one tx).
    }
  }
  return { ok: false };
}

/** Add value to an existing ACTIVE card (ledger topup + cached balance bump). */
export async function topUpGiftCard(
  venueId: string,
  cardId: string,
  amountCents: number,
): Promise<boolean> {
  if (!Number.isInteger(amountCents) || amountCents <= 0) return false;
  try {
    return await db.transaction(async (tx) => {
      const [card] = await tx
        .select({ id: giftCards.id, status: giftCards.status })
        .from(giftCards)
        .where(and(eq(giftCards.id, cardId), eq(giftCards.venueId, venueId)))
        .for("update")
        .limit(1);
      if (!card || card.status !== "active") return false;

      await tx.insert(giftCardLedger).values({
        venueId,
        giftCardId: cardId,
        deltaCents: amountCents,
        reason: "topup",
      });
      await tx
        .update(giftCards)
        .set({
          balanceCents: sql`${giftCards.balanceCents} + ${amountCents}`,
          updatedAt: new Date(),
        })
        .where(and(eq(giftCards.id, cardId), eq(giftCards.venueId, venueId)));
      return true;
    });
  } catch {
    return false;
  }
}

/** Void a card so it can no longer be redeemed. Balance is left as a record. */
export async function voidGiftCard(
  venueId: string,
  cardId: string,
): Promise<boolean> {
  const updated = await db
    .update(giftCards)
    .set({ status: "void", updatedAt: new Date() })
    .where(and(eq(giftCards.id, cardId), eq(giftCards.venueId, venueId)))
    .returning({ id: giftCards.id });
  return updated.length > 0;
}
