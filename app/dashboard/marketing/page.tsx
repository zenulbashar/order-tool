import type { Metadata } from "next";
import Link from "next/link";

import { buttonStyles } from "@/app/_components/button-variants";
import { cardStyles } from "@/app/_components/card";
import { PageHeader } from "@/app/_components/page-header";
import { FEATURES, hasFeature } from "@/lib/billing/plans";
import { getVenuePlan } from "@/lib/billing/queries";
import { isMarketingCopyConfigured } from "@/lib/marketing/generate";
import { isMarketingImageConfigured } from "@/lib/marketing/image";
import { hasVenuePermission, requireUser, requireVenuePermission } from "@/lib/tenant";

import { MarketingClient } from "./marketing-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Marketing copy" };

/**
 * AI marketing generator: social, SMS and email drafts (and optionally an
 * image) from the venue's own facts. Drafts only — the owner copies and posts
 * them; nothing is published or stored from here. Plan-gated on the page AND
 * in every action.
 */
export default async function MarketingPage() {
  await requireUser();
  const venue = await requireVenuePermission("settings:manage");
  const canBill = await hasVenuePermission(venue.id, "billing:manage");
  const plan = await getVenuePlan(venue.id);
  const entitled = plan !== null && hasFeature({ plan }, FEATURES.AI_MARKETING);

  if (!entitled) {
    return (
      <main className="mx-auto w-full max-w-[1600px]">
        <PageHeader
          title="Marketing copy"
          description="Draft posts, texts and emails from your own menu and story."
        />
        <div className="mx-auto max-w-2xl px-5 py-10">
          <div className={cardStyles({ className: "flex flex-col items-center gap-4 text-center" })}>
            <span className="rounded-sm bg-accent px-2 py-0.5 font-mono text-micro font-bold uppercase tracking-wide text-forest">
              Pro plan
            </span>
            <h2 className="font-display text-lg font-semibold text-ink">
              Ready-to-post drafts in your own voice
            </h2>
            <p className="mx-auto max-w-md text-sm text-muted">
              Pick a goal, a tone and a topic; get Instagram, Facebook, SMS and
              email drafts that only use facts from your storefront. Included
              in Pro and Scale (and free during your trial).
            </p>
            {canBill ? (
              <Link href="/dashboard/billing" className={buttonStyles("primary", "md")}>
                See plans
              </Link>
            ) : (
              <p className="text-sm font-medium text-muted">Ask an owner to upgrade.</p>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1600px]">
      <PageHeader
        title="Marketing copy"
        description={`Drafts for ${venue.name}, from your own menu and story. Review, tweak, post.`}
      />
      <div className="px-5 py-6">
        <MarketingClient
          copyEnabled={isMarketingCopyConfigured()}
          imageEnabled={isMarketingImageConfigured()}
        />
      </div>
    </main>
  );
}
