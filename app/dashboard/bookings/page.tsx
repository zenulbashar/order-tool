import { asc } from "drizzle-orm";

import { PageHeader } from "@/app/_components/page-header";
import { db } from "@/lib/db";
import { venueTables } from "@/lib/db/schema";
import { requestNowMs } from "@/lib/schedule";
import { requireUser, requireVenuePermission, scopedToVenue } from "@/lib/tenant";

import { BookingsBoard } from "./bookings-board";
import { NewBookingAlert } from "./new-booking-alert";
import { getUpcomingBookingCount, getVenueBookings } from "./queries";

// Live floor data — never served from a cache.
export const dynamic = "force-dynamic";

/**
 * How far back the list reaches. A booking from earlier today is still operational
 * (the party may be sitting, or may not have shown), so the service does not
 * vanish at the moment each slot passes.
 */
const LOOKBACK_MS = 6 * 60 * 60 * 1000;

/**
 * The owner's bookings screen.
 *
 * Gated on `orders:view` rather than a new permission: bookings are floor work,
 * the people who need them are the people already on the orders board, and the
 * PII exposed (name, email, phone) is the same shape that board already shows.
 * Adding a `bookings:*` permission would also mean adding it to every role, and
 * the audit is explicit that a declared-but-unenforced permission is a smell.
 */
export default async function BookingsPage() {
  await requireUser();
  const venue = await requireVenuePermission("orders:view");

  const nowMs = requestNowMs();
  const [bookings, upcomingCount, tables] = await Promise.all([
    getVenueBookings(venue.id, new Date(nowMs - LOOKBACK_MS)),
    getUpcomingBookingCount(venue.id, new Date(nowMs)),
    db
      .select({ id: venueTables.id, label: venueTables.label })
      .from(venueTables)
      .where(scopedToVenue(venueTables.venueId, venue.id))
      .orderBy(asc(venueTables.sortOrder)),
  ]);

  return (
    <main className="min-h-full">
      <PageHeader
        title="Bookings"
        description={
          venue.bookingsEnabled
            ? `${venue.name} · ${upcomingCount} upcoming`
            : `${venue.name} · online bookings are off`
        }
      />

      <div className="px-5 py-6">
        {!venue.bookingsEnabled ? (
          <div className="mb-5 rounded-card border border-[var(--color-warm)]/40 bg-[var(--color-warm)]/10 p-4">
            <p className="text-sm font-semibold text-ink">
              Online bookings are turned off
            </p>
            <p className="mt-1 text-sm text-muted">
              Diners can&apos;t book a table on your storefront yet. Turn it on in
              Settings → Bookings. Any bookings already taken still show below.
            </p>
          </div>
        ) : null}

        <BookingsBoard
          bookings={bookings}
          tables={tables}
          timezone={venue.timezone}
        />
      </div>

      {/* Live alert while this page is open. The dashboard home carries the same
          component, so an owner sitting on either screen is told. */}
      <NewBookingAlert count={upcomingCount} />
    </main>
  );
}
