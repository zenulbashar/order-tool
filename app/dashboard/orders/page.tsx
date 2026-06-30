import { PageHeader } from "@/app/_components/page-header";
import { requestNowMs } from "@/lib/schedule";
import { requireUser, requireVenue } from "@/lib/tenant";

import { OrderCard } from "./order-card";
import { OrdersAutoRefresh } from "./orders-auto-refresh";
import { PrintProvider } from "./print-context";
import {
  getRecentCompletedOrders,
  getVenueOrders,
  type FulfillmentStatus,
  type KitchenOrder,
} from "./queries";

// Always render fresh: the kitchen queue must reflect orders that arrived since
// the last request. The live-refresh client re-runs this via router.refresh().
export const dynamic = "force-dynamic";

// The active board columns, in forward order. COMPLETED is fed by the bounded
// recent-completed query (always visible) and rendered compactly.
const BOARD_COLUMNS: { status: FulfillmentStatus; label: string }[] = [
  { status: "new", label: "New" },
  { status: "preparing", label: "Preparing" },
  { status: "ready", label: "Ready" },
  { status: "completed", label: "Completed" },
];

export default async function OrdersPage() {
  await requireUser();
  const venue = await requireVenue();

  const activeOrders = await getVenueOrders(venue.id);
  // Always-visible COMPLETED column, bounded to a recent window so it stays
  // cheap on every 12s poll (see getRecentCompletedOrders).
  const completedOrders = await getRecentCompletedOrders(venue.id);

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

  // Bucket the make-now population by fulfillment status; COMPLETED draws from
  // the separate bounded query above.
  const ordersFor = (status: FulfillmentStatus) =>
    status === "completed"
      ? completedOrders
      : makeNowOrders.filter((order) => order.fulfillmentStatus === status);

  return (
    <PrintProvider venueName={venue.name} timezone={venue.timezone}>
      {/* Full-width on this page only (not the shared max-w-3xl) so the 4-column
          board can breathe; scoped here, no shared layout/primitive change. */}
      <main className="min-h-full">
        <PageHeader
          title="Orders"
          description={`${venue.name} · live kitchen queue`}
          action={<OrdersAutoRefresh />}
        />

        {upcomingOrders.length > 0 ? (
          <section className="border-b border-line px-5 py-6">
            <h2 className="text-sm font-semibold text-ink">
              Scheduled (upcoming) ({upcomingOrders.length})
            </h2>
            <p className="mt-1 text-xs text-muted">
              Pre-orders shown by pickup time. Each moves into the board when it
              is due.
            </p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {upcomingOrders.map((order) => (
                <OrderCard key={order.id} order={order} timezone={venue.timezone} />
              ))}
            </ul>
          </section>
        ) : null}

        <section className="px-5 py-8">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {BOARD_COLUMNS.map((column) => {
              const orders = ordersFor(column.status);
              const isCompleted = column.status === "completed";
              return (
                <div key={column.status} className="min-w-0">
                  <div className="flex items-baseline justify-between gap-2 border-b border-line pb-2">
                    <h2 className="text-sm font-semibold text-ink">
                      {column.label}
                    </h2>
                    <span className="font-mono text-xs font-bold text-muted">
                      {orders.length}
                    </span>
                  </div>
                  {orders.length === 0 ? (
                    <p className="mt-3 rounded-card border border-dashed border-line p-6 text-center text-xs text-muted">
                      {isCompleted ? "Nothing completed recently" : "No orders"}
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-3">
                      {orders.map((order) => (
                        <OrderCard
                          key={order.id}
                          order={order}
                          timezone={venue.timezone}
                          compact={isCompleted}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </PrintProvider>
  );
}
