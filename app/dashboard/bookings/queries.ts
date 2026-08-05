import { and, asc, count, eq, gte, inArray, lt } from "drizzle-orm";

import { db } from "@/lib/db";
import { bookings, bookingStatus, venueTables } from "@/lib/db/schema";
import { scopedToVenue } from "@/lib/tenant";

export type BookingStatus = (typeof bookingStatus.enumValues)[number];

export type OwnerBooking = {
  id: string;
  status: BookingStatus;
  bookedFor: Date;
  partySize: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  notes: string | null;
  tableId: string | null;
  tableLabel: string | null;
  createdAt: Date;
};

/** Statuses still occupying the floor plan. */
export const LIVE_BOOKING_STATUSES: BookingStatus[] = ["confirmed", "seated"];

/**
 * A venue's bookings from `since` onward, oldest first — the order a service
 * runs in. venue_id scopes the query like every other read in this app, and the
 * table label is LEFT joined so a booking whose table was later deleted still
 * renders (the FK is ON DELETE SET NULL for the same reason).
 */
export async function getVenueBookings(
  venueId: string,
  since: Date,
): Promise<OwnerBooking[]> {
  const rows = await db
    .select({
      id: bookings.id,
      status: bookings.status,
      bookedFor: bookings.bookedFor,
      partySize: bookings.partySize,
      customerName: bookings.customerName,
      customerEmail: bookings.customerEmail,
      customerPhone: bookings.customerPhone,
      notes: bookings.notes,
      tableId: bookings.tableId,
      tableLabel: venueTables.label,
      createdAt: bookings.createdAt,
    })
    .from(bookings)
    .leftJoin(venueTables, eq(venueTables.id, bookings.tableId))
    .where(
      and(
        scopedToVenue(bookings.venueId, venueId),
        gte(bookings.bookedFor, since),
      ),
    )
    .orderBy(asc(bookings.bookedFor));

  return rows;
}

/**
 * Count of live bookings still to come — the sidebar badge, and the number the
 * dashboard poller watches to decide whether something NEW has arrived.
 *
 * Counting only future, live bookings is what makes it usable as a change
 * signal: it falls when a party is seated or cancels and rises when a booking
 * lands, so a rise is unambiguous.
 */
export async function getUpcomingBookingCount(
  venueId: string,
  now: Date,
): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(bookings)
    .where(
      and(
        scopedToVenue(bookings.venueId, venueId),
        inArray(bookings.status, LIVE_BOOKING_STATUSES),
        gte(bookings.bookedFor, now),
      ),
    );
  return row?.value ?? 0;
}

/**
 * Bookings that have come and gone without being seated or resolved. Surfaced so
 * a stale "confirmed" row from three hours ago does not sit in the live list
 * pretending to be upcoming.
 */
export async function getStaleBookingCount(
  venueId: string,
  before: Date,
): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(bookings)
    .where(
      and(
        scopedToVenue(bookings.venueId, venueId),
        eq(bookings.status, "confirmed"),
        lt(bookings.bookedFor, before),
      ),
    );
  return row?.value ?? 0;
}
