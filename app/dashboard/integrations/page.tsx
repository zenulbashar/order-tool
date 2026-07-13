import { and, desc, eq, gt, inArray } from "drizzle-orm";

import { PageHeader } from "@/app/_components/page-header";
import { decryptSecret } from "@/lib/crypto";
import { db } from "@/lib/db";
import {
  integrationJobs,
  orders,
  venueIntegrations,
} from "@/lib/db/schema";
import { listLocations } from "@/lib/integrations/square/oauth";
import { requireUser, requireVenue, scopedToVenue } from "@/lib/tenant";
import { formatCents, orderReference } from "@/lib/validation";

import { type ActivityRow, SquareDetailDrawer } from "./detail-drawer";
import { ConnectorCard } from "./integration-card";
import { type SquareCardData, SquareCard } from "./square-card";

// Live per-venue integration + job state on every request.
export const dynamic = "force-dynamic";

const HUB_PATH = "/dashboard/integrations";
const ACTIVITY_LIMIT = 20;
const MAX_ATTEMPTS = 6; // mirrors dispatch's schedule for the retry copy

function agoLabel(from: Date, now: number): string {
  const seconds = Math.max(0, Math.round((now - from.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}

function delayLabel(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.round(seconds / 60)} min`;
}

/**
 * Integrations hub (Track A live). Square renders from real
 * venue_integrations + integration_jobs state; only SAFE fields are passed to
 * the client components (token columns never leave the server). Coming-soon
 * connectors and the forest money-honesty note are unchanged from Track 0.
 */
export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireUser();
  const venue = await requireVenue();
  const sp = await searchParams;
  const showError = sp.error === "square";
  const showDrawer = sp.detail === "square";
  const remapping = sp.remap === "square";

  const [integration] = await db
    .select()
    .from(venueIntegrations)
    .where(
      and(
        scopedToVenue(venueIntegrations.venueId, venue.id),
        eq(venueIntegrations.provider, "square"),
      ),
    )
    .limit(1);

  // Job state for the card strip, hub stats, and the drawer.
  const now = new Date().getTime();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const recentJobs = integration
    ? await db
        .select({
          id: integrationJobs.id,
          status: integrationJobs.status,
          attempts: integrationJobs.attempts,
          nextAttemptAt: integrationJobs.nextAttemptAt,
          lastError: integrationJobs.lastError,
          createdAt: integrationJobs.createdAt,
          updatedAt: integrationJobs.updatedAt,
          publicToken: orders.publicToken,
          orderType: orders.orderType,
          tableLabel: orders.tableLabel,
          totalCents: orders.totalCents,
        })
        .from(integrationJobs)
        .innerJoin(orders, eq(orders.id, integrationJobs.orderId))
        .where(
          and(
            scopedToVenue(integrationJobs.venueId, venue.id),
            eq(integrationJobs.provider, "square"),
          ),
        )
        .orderBy(desc(integrationJobs.createdAt))
        .limit(ACTIVITY_LIMIT)
    : [];
  const attentionCount = integration
    ? (
        await db
          .select({ id: integrationJobs.id })
          .from(integrationJobs)
          .where(
            and(
              scopedToVenue(integrationJobs.venueId, venue.id),
              eq(integrationJobs.provider, "square"),
              inArray(integrationJobs.status, ["failed", "dead"]),
            ),
          )
      ).length
    : 0;
  const succeeded24h = integration
    ? await db
        .select({
          createdAt: integrationJobs.createdAt,
          updatedAt: integrationJobs.updatedAt,
        })
        .from(integrationJobs)
        .where(
          and(
            scopedToVenue(integrationJobs.venueId, venue.id),
            eq(integrationJobs.provider, "square"),
            eq(integrationJobs.status, "succeeded"),
            gt(integrationJobs.updatedAt, dayAgo),
          ),
        )
    : [];
  const avgDelayMs =
    succeeded24h.length > 0
      ? succeeded24h.reduce(
          (sum, job) => sum + (job.updatedAt.getTime() - job.createdAt.getTime()),
          0,
        ) / succeeded24h.length
      : null;

  // Card state (tokens stay server-side; card gets derived strings only).
  const hasTokens = Boolean(integration?.accessTokenEnc);
  const needsLocation = hasTokens && !integration?.providerLocationId;
  const state: SquareCardData["state"] = !integration
    ? "not_connected"
    : integration.status === "revoked"
      ? "revoked"
      : needsLocation
        ? "pick_location"
        : integration.status === "disabled"
          ? hasTokens
            ? "paused"
            : "not_connected"
          : "connected";

  // Live location list only when the picker is actually on screen.
  let locations: { id: string; name: string }[] | null = null;
  if ((state === "pick_location" || remapping) && integration?.accessTokenEnc) {
    try {
      locations = (
        await listLocations(decryptSecret(integration.accessTokenEnc))
      ).filter((location) => location.status === "ACTIVE");
    } catch {
      locations = null; // card falls back; error banner covers the rest
    }
  }

  const squareCard: SquareCardData = {
    state: remapping && state === "connected" ? "pick_location" : state,
    locationName: integration?.providerLocationName ?? null,
    venueName: venue.name,
    lastMirroredAgo: integration?.lastSuccessAt
      ? `${agoLabel(integration.lastSuccessAt, now)} ago`
      : null,
    attentionCount,
    locations,
    remapHref: `${HUB_PATH}?remap=square`,
    detailHref: `${HUB_PATH}?detail=square`,
    // The blank-authorize workaround is a Square SANDBOX developer quirk, not
    // something a real owner should ever read. Only surface it when running
    // against Square sandbox AND locally (never on a deployed site, where every
    // viewer is a live owner) — so the word "Sandbox" never reaches an owner.
    sandbox:
      (process.env.SQUARE_ENVIRONMENT ?? "sandbox") !== "production" &&
      process.env.NODE_ENV !== "production",
  };

  const activityRows: ActivityRow[] = recentJobs.map((job) => {
    const title = `${orderReference(job.publicToken)} · ${
      job.orderType === "dine_in" ? `Table ${job.tableLabel ?? "?"}` : "Pickup"
    } · $${formatCents(job.totalCents)}`;
    if (job.status === "succeeded") {
      return {
        id: job.id,
        title,
        subtitle: "Mirrored to Square",
        tone: "ok" as const,
        agoLabel: agoLabel(job.updatedAt, now),
        retryable: false,
      };
    }
    if (job.status === "pending" || job.status === "processing") {
      const wait = Math.max(0, Math.round((job.nextAttemptAt.getTime() - now) / 1000));
      return {
        id: job.id,
        title,
        subtitle:
          job.attempts === 0
            ? "Queued to mirror"
            : `Retrying · attempt ${Math.min(job.attempts + 1, MAX_ATTEMPTS)} of ${MAX_ATTEMPTS}${wait > 0 ? ` — next in ${wait}s` : ""}`,
        tone: "retrying" as const,
        agoLabel: agoLabel(job.createdAt, now),
        retryable: false,
      };
    }
    return {
      id: job.id,
      title,
      subtitle: job.lastError ?? "Mirroring failed",
      tone: "failed" as const,
      agoLabel: agoLabel(job.updatedAt, now),
      retryable: true,
    };
  });

  const connectedCount = state === "connected" ? 1 : 0;

  return (
    <main className="mx-auto max-w-4xl">
      <PageHeader
        title="Integrations"
        description={venue.name}
        action={
          <span className="rounded-pill bg-sand px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-muted">
            {connectedCount} of 3 connected
          </span>
        }
      />

      <section className="space-y-4 px-5 py-8">
        {showError ? (
          <p
            className="rounded-control bg-[var(--color-warm)]/10 px-3 py-2 text-sm text-[var(--color-warm-deep)]"
            role="alert"
          >
            Connecting to Square didn&apos;t finish — try again.
          </p>
        ) : null}

        <p className="text-sm text-muted">
          Mirror orders and items to the tools your venue already runs on.
          Payments always stay with Stripe — and nothing moves without you.
        </p>

        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          <SquareCard data={squareCard} />
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

        {/* Hub stats — rendered once Square is live, from real job rows. */}
        {state === "connected" || attentionCount > 0 ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[14px] border border-line bg-surface-elevated p-4 shadow-card">
              <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-label">
                Mirrored · 24h
              </p>
              <p className="mt-1.5 font-display text-2xl font-extrabold text-ink">
                {succeeded24h.length}
              </p>
            </div>
            <div className="rounded-[14px] border border-line bg-surface-elevated p-4 shadow-card">
              <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-label">
                Need attention
              </p>
              <p className="mt-1.5 font-display text-2xl font-extrabold text-ink">
                {attentionCount}
              </p>
              {attentionCount > 0 ? (
                <p className="mt-1 text-[10px] font-semibold text-[var(--color-warm-deep)]">
                  Open the Square card review →
                </p>
              ) : null}
            </div>
            <div className="rounded-[14px] border border-line bg-surface-elevated p-4 shadow-card">
              <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-label">
                Avg mirror delay
              </p>
              <p className="mt-1.5 font-display text-2xl font-extrabold text-ink">
                {avgDelayMs === null ? "—" : delayLabel(avgDelayMs)}
              </p>
              <p className="mt-1 text-[10px] font-semibold text-muted">
                Order confirmed → in your POS
              </p>
            </div>
          </div>
        ) : null}

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

      {showDrawer && integration ? (
        <SquareDetailDrawer
          mappingLabel={`${venue.name} ↔ ${integration.providerLocationName ?? "No location mapped"}`}
          stats={{
            mirrored24h: succeeded24h.length,
            attention: attentionCount,
            avgDelayLabel: avgDelayMs === null ? null : delayLabel(avgDelayMs),
          }}
          rows={activityRows}
          closeHref={HUB_PATH}
        />
      ) : null}
    </main>
  );
}
