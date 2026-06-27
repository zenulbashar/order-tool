import Link from "next/link";

import { requestNowMs } from "@/lib/schedule";
import { requireUser, requireVenue } from "@/lib/tenant";

import { OrderCard } from "./order-card";
import { OrdersAutoRefresh } from "./orders-auto-refresh";
import { PrintProvider } from "./print-context";
import { getVenueOrders, type KitchenOrder } from "./queries";

// Always render fresh: the kitchen queue must reflect orders that arrived since
// the last request. The live-refresh client re-runs this via router.refresh().
export const dynamic = "force-dynamic";

type OrdersPageProps = {
  searchParams: Promise<{ completed?: string }>;
};

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  await requireUser();
  const venue = await requireVenue();

  // Completed orders are hidden by default; the toggle is a query param so it
  // survives router.refresh() and only pays for the extra query when requested.
  const { completed } = await searchParams;
  const showCompleted = completed === "1";

  const activeOrders = await getVenueOrders(venue.id);
  const completedOrders = showCompleted
    ? await getVenueOrders(venue.id, { completed: true })
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

  return (
    <PrintProvider venueName={venue.name} timezone={venue.timezone}>
      <main className="mx-auto max-w-3xl px-6 py-10">
        <header className="flex items-start justify-between gap-4 border-b border-gray-200 pb-6">
          <div className="space-y-1">
            <Link
              href="/dashboard"
              className="text-sm text-gray-500 underline hover:text-gray-700"
            >
              ← Dashboard
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
            <p className="text-sm text-gray-500">{venue.name} · live kitchen queue</p>
          </div>
          <OrdersAutoRefresh />
        </header>

        <section className="py-8">
          <h2 className="text-sm font-semibold text-gray-900">
            Active{makeNowOrders.length > 0 ? ` (${makeNowOrders.length})` : ""}
          </h2>
          {makeNowOrders.length === 0 ? (
            <p className="mt-4 rounded-lg border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
              No active orders
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {makeNowOrders.map((order) => (
                <OrderCard key={order.id} order={order} timezone={venue.timezone} />
              ))}
            </ul>
          )}
        </section>

        {upcomingOrders.length > 0 ? (
          <section className="border-t border-gray-100 py-8">
            <h2 className="text-sm font-semibold text-gray-900">
              Scheduled (upcoming) ({upcomingOrders.length})
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              Pre-orders shown by pickup time. Each moves into Active when it is
              due.
            </p>
            <ul className="mt-4 space-y-3">
              {upcomingOrders.map((order) => (
                <OrderCard key={order.id} order={order} timezone={venue.timezone} />
              ))}
            </ul>
          </section>
        ) : null}

        <section className="border-t border-gray-100 py-6">
          <Link
            href={showCompleted ? "/dashboard/orders" : "/dashboard/orders?completed=1"}
            className="text-sm font-medium text-gray-700 underline hover:text-gray-900"
          >
            {showCompleted ? "Hide completed" : "Show completed"}
          </Link>
          {showCompleted ? (
            completedOrders.length === 0 ? (
              <p className="mt-4 text-sm text-gray-500">No completed orders yet.</p>
            ) : (
              <ul className="mt-4 space-y-3 opacity-80">
                {completedOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    timezone={venue.timezone}
                  />
                ))}
              </ul>
            )
          ) : null}
        </section>
      </main>
    </PrintProvider>
  );
}
