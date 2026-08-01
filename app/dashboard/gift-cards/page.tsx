import type { Metadata } from "next";

import { PageHeader } from "@/app/_components/page-header";
import { getVenueGiftCards } from "@/lib/giftcards/queries";
import { requireVenuePermission } from "@/lib/tenant";

import { GiftCardsClient } from "./gift-cards-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Gift cards" };

/**
 * Owner gift cards — issue stored-value cards (comps, refunds, promos) that
 * diners redeem at checkout. Redeem-only v1: cards are created here, not bought
 * online.
 *
 * Gated on giftcards:manage, NOT on bare membership. Redemption has SHIPPED and
 * authorises on the code alone — resolveGiftCardForRedemption matches venue +
 * code + active, with no purchaser, no PIN and no possession proof — so every
 * code this page prints is a bearer instrument. Listing them to a kitchen login
 * would hand out the venue's stored value, redeemable as an ordinary diner on
 * the public storefront. The mutating actions in this directory already require
 * this permission; the read has to match them or the gate is decorative.
 */
export default async function GiftCardsPage() {
  const venue = await requireVenuePermission("giftcards:manage");
  const cards = await getVenueGiftCards(venue.id);

  return (
    <main className="mx-auto w-full max-w-[1600px]">
      <PageHeader
        title="Gift cards"
        description="Issue a card and share its code — diners redeem it at checkout."
      />
      <div className="px-5 py-8">
        <GiftCardsClient cards={cards} />
      </div>
    </main>
  );
}
