"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { bookings, venueTables } from "@/lib/db/schema";
import { requireVenuePermission, scopedToVenue } from "@/lib/tenant";

import type { BookingStatus } from "./queries";

const BOOKINGS_PATH = "/dashboard/bookings";

export type BookingActionResult = { ok: boolean; error?: string };

/**
 * Move a booking through its lifecycle.
 *
 * Every write here re-resolves the venue from the SESSION and pins it in the
 * WHERE — the booking id arrives from the client and is never trusted on its
 * own, so a crafted id belonging to another venue matches no row. That is the
 * same IDOR shape the rest of the dashboard uses, and it is not type-enforced,
 * which is why it is asserted in a test rather than left to review.
 *
 * `seatedAt` is stamped when (and only when) the party is seated, so no-show and
 * dwell reporting later has a real timestamp rather than an inference from the
 * status column.
 */
export async function setBookingStatus(
  bookingId: string,
  status: BookingStatus,
): Promise<BookingActionResult> {
  const venue = await requireVenuePermission("orders:manage");
  if (!bookingId) return { ok: false, error: "Missing booking." };

  const updated = await db
    .update(bookings)
    .set({
      status,
      ...(status === "seated" ? { seatedAt: new Date() } : {}),
    })
    .where(
      and(
        eq(bookings.id, bookingId),
        scopedToVenue(bookings.venueId, venue.id),
      ),
    )
    .returning({ id: bookings.id });

  if (updated.length === 0) {
    return { ok: false, error: "That booking is no longer available." };
  }

  revalidatePath(BOOKINGS_PATH);
  return { ok: true };
}

/**
 * Assign (or clear) the table a booking will sit at.
 *
 * The TABLE is validated to belong to the same venue before it is written.
 * Without that check an owner could be handed another venue's table id and store
 * it — the FK alone would accept it, because it only proves the table exists.
 */
export async function assignBookingTable(
  bookingId: string,
  tableId: string | null,
): Promise<BookingActionResult> {
  const venue = await requireVenuePermission("orders:manage");
  if (!bookingId) return { ok: false, error: "Missing booking." };

  if (tableId) {
    const [table] = await db
      .select({ id: venueTables.id })
      .from(venueTables)
      .where(
        and(
          eq(venueTables.id, tableId),
          scopedToVenue(venueTables.venueId, venue.id),
        ),
      )
      .limit(1);
    if (!table) return { ok: false, error: "That table isn't yours." };
  }

  const updated = await db
    .update(bookings)
    .set({ tableId })
    .where(
      and(
        eq(bookings.id, bookingId),
        scopedToVenue(bookings.venueId, venue.id),
      ),
    )
    .returning({ id: bookings.id });

  if (updated.length === 0) {
    return { ok: false, error: "That booking is no longer available." };
  }

  revalidatePath(BOOKINGS_PATH);
  return { ok: true };
}
