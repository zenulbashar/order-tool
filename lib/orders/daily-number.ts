import "server-only";

import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { venueOrderSequences, venues } from "@/lib/db/schema";
import { venueServiceDate } from "@/lib/orders/service-date";

/**
 * Assign the next short "call number" for a venue's order — a per-venue counter
 * that resets each day in the venue's timezone (so staff can call "Order 7").
 *
 * `serviceInstant` is the moment the order is FOR — a scheduled pre-order's
 * pickup time, or now for an ASAP order. It is REQUIRED rather than defaulted to
 * the wall clock, because defaulting is exactly how this went wrong: numbering a
 * Thursday pre-order against Monday guarantees a collision with the real
 * Thursday order that later takes the same number. A new caller has to decide.
 * Atomic: an INSERT … ON CONFLICT DO UPDATE … +1 RETURNING serialises concurrent
 * orders, so two orders never share a number within a day. BEST-EFFORT and INERT
 * to money — any failure returns null and the caller simply stores no number
 * (the order still succeeds; the display falls back to the order reference).
 */
export async function assignDailyNumber(
  venueId: string,
  serviceInstant: Date,
): Promise<number | null> {
  try {
    const [row] = await db
      .select({ tz: venues.timezone })
      .from(venues)
      .where(eq(venues.id, venueId))
      .limit(1);
    const tz = row?.tz || "Australia/Sydney";
    // The service day of the instant the order is FOR, in the venue's timezone,
    // so the counter resets at local midnight.
    const serviceDate = venueServiceDate(serviceInstant, tz);

    const [seq] = await db
      .insert(venueOrderSequences)
      .values({ venueId, serviceDate, lastNumber: 1 })
      .onConflictDoUpdate({
        target: [venueOrderSequences.venueId, venueOrderSequences.serviceDate],
        set: { lastNumber: sql`${venueOrderSequences.lastNumber} + 1` },
      })
      .returning({ n: venueOrderSequences.lastNumber });
    return seq?.n ?? null;
  } catch {
    return null;
  }
}
