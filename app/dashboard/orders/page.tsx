import { PageHeader } from "@/app/_components/page-header";
import { requestNowMs } from "@/lib/schedule";
import { requireUser, requireVenuePermission } from "@/lib/tenant";

import { OrdersAutoRefresh } from "./orders-auto-refresh";
import { OrdersBoard } from "./orders-board";
import { PrintProvider } from "./print-context";
import {
  getRecentCompletedOrders,
  getVenueOrders,
  getVenueStations,
  type KitchenOrder,
} from "./queries";

// Always render fresh: the kitchen queue must reflect orders that arrived since
// the last request. The live-refresh client re-runs this via router.refresh().
export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  await requireUser();
  const venue = await requireVenuePermission("orders:view");

  const activeOrders = await getVenueOrders(venue.id);
  // Always-visible COMPLETED column, bounded to a recent window so it stays
  // cheap on every 12s poll (see getRecentCompletedOrders).
  const completedOrders = await getRecentCompletedOrders(venue.id);
  // Owner-defined prep stations for the per-station label prints. Only loaded
  // when the venue turned multi-station printing on in onboarding/settings.
  const stations = venue.stationPrintingEnabled
    ? await getVenueStations(venue.id)
    : [];

  // Surface scheduled orders by their pickup time, not the instant placed: a
  // scheduled order waits in "Upcoming" until it's within the lead window of its
  // pickup time, then joins the make-now queue (the 12s refresh migrates it).
  // ASAP orders (scheduled_for null) are always make-now and keep today's FIFO.
  const dueThreshold = requestNowMs() + venue.schedulingLeadMinutes * 60_000;
  const effectiveTime = (order: KitchenOrder) =>
    (order.scheduledFor ?? order.createdAt).getTime();
  const isUpcoming = (order: KitchenOrder) =>
    order.scheduledFor !== null && order.scheduledFor.getTime() > dueThreshold;
  const makeNowOrders = activeOrders
    .filter((order) => !isUpcoming(order))
    .sort((a, b) => effectiveTime(a) - effectiveTime(b));
  const upcomingOrders = activeOrders
    .filter(isUpcoming)
    .sort((a, b) => effectiveTime(a) - effectiveTime(b));

  // GST label for the owner-facing tax line, or null when the venue has GST
  // off. Folding `taxEnabled` into null here keeps every downstream component
  // from having to know the tax config exists — they render the line if they
  // are given a label and the order carries a component, and otherwise do not.
  const taxLabel = venue.taxEnabled ? venue.taxLabel : null;

  return (
    <PrintProvider
      venueName={venue.name}
      timezone={venue.timezone}
      taxLabel={taxLabel}
      stations={stations}
      stationPrintingEnabled={venue.stationPrintingEnabled}
    >
      {/* Full-width on this page only (not the shared max-w-3xl) so the 4-column
          board can breathe; scoped here, no shared layout/primitive change. */}
      <main className="min-h-full">
        <PageHeader
          title="Orders"
          description={`${venue.name} · live kitchen queue`}
          action={<OrdersAutoRefresh />}
        />

        {/* Filter pills + the column board live in a client component so the
            order-type filter and the per-column counts update without a round
            trip. The make-now/upcoming split above stays server-computed. */}
        <OrdersBoard
          makeNowOrders={makeNowOrders}
          upcomingOrders={upcomingOrders}
          completedOrders={completedOrders}
          timezone={venue.timezone}
          taxLabel={taxLabel}
        />
      </main>
    </PrintProvider>
  );
}
