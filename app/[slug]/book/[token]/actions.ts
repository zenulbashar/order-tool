"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { bookings } from "@/lib/db/schema";

export type CancelBookingResult = { ok: boolean; error?: string };

/**
 * Let the diner cancel their own booking from the confirmation link.
 *
 * Authorised by the TOKEN alone — this is an anonymous surface and the token is
 * the bearer credential, exactly like the order-status page. Two consequences
 * are deliberate:
 *
 *  - the lookup is by token, never by id, so knowing or guessing a booking id
 *    grants nothing;
 *  - the WHERE also pins the status to 'confirmed', so a replayed cancel, or a
 *    cancel of a party the venue already seated, changes nothing. That makes the
 *    action idempotent without a separate read-then-write race.
 *
 * Cancelling frees the seats: the capacity check counts only 'confirmed' and
 * 'seated' bookings, so this table becomes bookable again immediately.
 */
export async function cancelBooking(
  token: string,
): Promise<CancelBookingResult> {
  if (!token) return { ok: false, error: "That booking link isn't valid." };

  const updated = await db
    .update(bookings)
    .set({ status: "cancelled" })
    .where(
      and(eq(bookings.publicToken, token), eq(bookings.status, "confirmed")),
    )
    .returning({ id: bookings.id, venueId: bookings.venueId });

  if (updated.length === 0) {
    // Either already cancelled, already seated, or no such token. Deliberately
    // one message: distinguishing them would tell an anonymous caller whether a
    // token exists.
    return {
      ok: false,
      error:
        "That booking can't be cancelled online any more. Please call the venue.",
    };
  }

  revalidatePath("/dashboard/bookings");
  return { ok: true };
}
