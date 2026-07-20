import type { Metadata } from "next";

import { PageHeader } from "@/app/_components/page-header";
import { getVenueGiftCards } from "@/lib/giftcards/queries";
import { requireUser, requireVenue } from "@/lib/tenant";

import { GiftCardsClient } from "./gift-cards-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Gift cards" };

/**
 * Owner gift cards — issue stored-value cards (comps, refunds, promos) that
 * diners redeem at checkout. Redeem-only v1: cards are created here, not bought
 * online. Venue-scoped via requireVenue; no money-path (issuing changes no
 * order or charge — redemption, which does, ships separately).
 */
export default async function GiftCardsPage() {
  await requireUser();
  const venue = await requireVenue();
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
