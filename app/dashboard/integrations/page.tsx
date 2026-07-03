import { and, eq } from "drizzle-orm";

import { PageHeader } from "@/app/_components/page-header";
import { db } from "@/lib/db";
import { venueIntegrations } from "@/lib/db/schema";
import { requireUser, requireVenue, scopedToVenue } from "@/lib/tenant";

import { ConnectorCard, SquareLogo } from "./integration-card";

// Reads live per-venue integration state on every request.
export const dynamic = "force-dynamic";

/**
 * Integrations hub (Track 0, design: P2E-Owner extension "Integrations hub").
 * Connectors mirror confirmed orders OUTWARD — nothing here touches the money
 * path, and the page copy says so. Track 0 ships the hub with the Square card
 * in its pre-connect state (OAuth arrives with the Square build) and the
 * designed coming-soon connectors. No amber anywhere: integrations are not AI.
 */
export default async function IntegrationsPage() {
  await requireUser();
  const venue = await requireVenue();

  // Venue-scoped read; Track 0 has no connect flow yet, so this is empty
  // until the Square build ships — the count pill stays honest either way.
  const connected = await db
    .select({ id: venueIntegrations.id })
    .from(venueIntegrations)
    .where(
      and(
        scopedToVenue(venueIntegrations.venueId, venue.id),
        eq(venueIntegrations.status, "active"),
      ),
    );

  return (
    <main className="mx-auto max-w-4xl">
      <PageHeader
        title="Integrations"
        description={venue.name}
        action={
          <span className="rounded-pill bg-sand px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-muted">
            {connected.length} of 3 connected
          </span>
        }
      />

      <section className="space-y-4 px-5 py-8">
        <p className="text-sm text-muted">
          Mirror orders and items to the tools your venue already runs on.
          Payments always stay with Stripe — and nothing moves without you.
        </p>

        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          <ConnectorCard
            name="Square"
            chip="POS"
            description="Mirror every prompt2eat order into your Square register, in seconds."
            logo={<SquareLogo />}
            state="not_connected"
            connectLabel="Connect Square"
            connectHint="Connect opens with the Square update"
          />
          <ConnectorCard
            name="Doshii"
            chip="Coming soon"
            description="One bridge to Lightspeed, Impos, H&L and more — orders land in whichever POS your kitchen already trusts."
            logo={<span aria-hidden="true">D</span>}
            state="coming_soon"
          />
          <ConnectorCard
            name="Ordermentum"
            chip="Coming soon"
            description="Order from your suppliers straight out of stock levels — low kale on Tuesday becomes a delivery on Thursday."
            logo={<span aria-hidden="true">O</span>}
            state="coming_soon"
          />
        </div>

        {/* The design's forest reassurance note — money-path honesty, verbatim. */}
        <div className="flex gap-2.5 rounded-[13px] bg-forest-deep px-3.5 py-3">
          <span aria-hidden="true" className="shrink-0 text-[13px] text-concierge-mint">
            ℹ
          </span>
          <p className="text-[11px] leading-relaxed text-concierge-sage">
            Integrations mirror orders and items only. Money always settles
            through your Stripe account — and disconnecting never deletes menu
            data.
          </p>
        </div>
      </section>
    </main>
  );
}
