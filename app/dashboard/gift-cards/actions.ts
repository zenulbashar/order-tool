"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { recordVenueAudit } from "@/lib/audit";
import {
  issueGiftCard,
  topUpGiftCard,
  voidGiftCard,
} from "@/lib/giftcards/manage";
import { requireVenuePermission } from "@/lib/tenant";

export type GiftCardState = { error?: string; issuedCode?: string };

/** The acting member, for audit attribution (M8 / audit F9). */
async function giftCardAuditActor(): Promise<{
  id?: string | null;
  email?: string | null;
}> {
  const session = await auth();
  return { id: session?.user?.id, email: session?.user?.email };
}

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

/**
 * Session + venue gate for the actions below. Deliberately NOT named
 * requireOwner: venue_members.role exists but is not yet enforced anywhere, so
 * this guarantees an authenticated member of the venue — not the owner role.
 * When role enforcement ships (staff invites), this is the seam where the role
 * check belongs.
 */
async function requireVenueMemberSession() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  return requireVenuePermission("giftcards:manage");
}

/**
 * Issue a new gift card with an opening balance (owner comps/refunds/promos).
 * Ownership is from requireVenuePermission("giftcards:manage") — never a client id. Returns the generated
 * code so the page can show it once for the owner to hand out.
 */
export async function issueGiftCardAction(
  _prev: GiftCardState,
  formData: FormData,
): Promise<GiftCardState> {
  const venue = await requireVenueMemberSession();

  const cents = dollarsToCents(String(formData.get("amount") ?? ""));
  if (cents === null) return { error: "Enter a valid amount." };
  const note = String(formData.get("note") ?? "").trim().slice(0, 120) || null;

  const result = await issueGiftCard(venue.id, cents, note);
  if (!result.ok) return { error: "Couldn't create the gift card. Try again." };

  // M8 / audit F9 — gift-card issuance is stored value leaving the venue;
  // the code itself is never logged, only the amount.
  await recordVenueAudit({
    venueId: venue.id,
    action: "gift_card_issued",
    detail: `$${(cents / 100).toFixed(2)}${note ? ` — ${note}` : ""}`,
    actor: await giftCardAuditActor(),
  });

  revalidatePath(PATH);
  return { issuedCode: result.code };
}

/** Add value to an existing active card. */
export async function topUpGiftCardAction(
  formData: FormData,
): Promise<{ ok: boolean }> {
  const venue = await requireVenueMemberSession();
  const cardId = String(formData.get("cardId") ?? "");
  const cents = dollarsToCents(String(formData.get("amount") ?? ""));
  // topUpGiftCard reports false for an invalid amount, a void or missing card
  // or a failed write. Discarding that left the page simply re-rendering with
  // the balance unchanged and nothing to say why — the outcome is returned so
  // the row can show it.
  const ok =
    cardId && cents !== null
      ? await topUpGiftCard(venue.id, cardId, cents)
      : false;
  revalidatePath(PATH);
  return { ok };
}

/** Void a card so it can no longer be redeemed. */
export async function voidGiftCardAction(formData: FormData): Promise<void> {
  const venue = await requireVenueMemberSession();
  const cardId = String(formData.get("cardId") ?? "");
  if (cardId) await voidGiftCard(venue.id, cardId);
  revalidatePath(PATH);
}
