"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import {
  issueGiftCard,
  topUpGiftCard,
  voidGiftCard,
} from "@/lib/giftcards/manage";
import { requireVenue } from "@/lib/tenant";

export type GiftCardState = { error?: string; issuedCode?: string };

const PATH = "/dashboard/gift-cards";
// A single card's value ceiling — a guard against a fat-finger ($100k here).
const MAX_CENTS = 10_000_000;

/** Parse a dollars string ("25", "25.00") to whole cents, or null if invalid. */
function dollarsToCents(raw: string): number | null {
  const n = Number(raw.trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  const cents = Math.round(n * 100);
  if (cents <= 0 || cents > MAX_CENTS) return null;
  return cents;
}

async function requireOwner() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  return requireVenue();
}

/**
 * Issue a new gift card with an opening balance (owner comps/refunds/promos).
 * Ownership is from requireVenue() — never a client id. Returns the generated
 * code so the page can show it once for the owner to hand out.
 */
export async function issueGiftCardAction(
  _prev: GiftCardState,
  formData: FormData,
): Promise<GiftCardState> {
  const venue = await requireOwner();

  const cents = dollarsToCents(String(formData.get("amount") ?? ""));
  if (cents === null) return { error: "Enter a valid amount." };
  const note = String(formData.get("note") ?? "").trim().slice(0, 120) || null;

  const result = await issueGiftCard(venue.id, cents, note);
  if (!result.ok) return { error: "Couldn't create the gift card. Try again." };

  revalidatePath(PATH);
  return { issuedCode: result.code };
}

/** Add value to an existing active card. */
export async function topUpGiftCardAction(formData: FormData): Promise<void> {
  const venue = await requireOwner();
  const cardId = String(formData.get("cardId") ?? "");
  const cents = dollarsToCents(String(formData.get("amount") ?? ""));
  if (cardId && cents !== null) {
    await topUpGiftCard(venue.id, cardId, cents);
  }
  revalidatePath(PATH);
}

/** Void a card so it can no longer be redeemed. */
export async function voidGiftCardAction(formData: FormData): Promise<void> {
  const venue = await requireOwner();
  const cardId = String(formData.get("cardId") ?? "");
  if (cardId) await voidGiftCard(venue.id, cardId);
  revalidatePath(PATH);
}
