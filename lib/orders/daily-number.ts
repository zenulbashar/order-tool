import "server-only";

import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { venueOrderSequences, venues } from "@/lib/db/schema";

/**
 * Assign the next short "call number" for a venue's order — a per-venue counter
 * that resets each day in the venue's timezone (so staff can call "Order 7").
 * Atomic: an INSERT … ON CONFLICT DO UPDATE … +1 RETURNING serialises concurrent
 * orders, so two orders never share a number within a day. BEST-EFFORT and INERT
 * to money — any failure returns null and the caller simply stores no number
 * (the order still succeeds; the display falls back to the order reference).
 */
export async function assignDailyNumber(venueId: string): Promise<number | null> {
  try {
    const [row] = await db
      .select({ tz: venues.timezone })
      .from(venues)
      .where(eq(venues.id, venueId))
      .limit(1);
    const tz = row?.tz || "Australia/Sydney";
    // en-CA formats as YYYY-MM-DD; the date in the VENUE's timezone is the
    // service day, so the counter resets at local midnight.
    const serviceDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

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
