import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { venues } from "@/lib/db/schema";

/**
 * Sales tax / GST (Australia-first) — INCLUSIVE model. AU menu prices are
 * GST-inclusive by law, so tax is a display/reporting COMPONENT of the price,
 * never added to the charge. `taxCents` is captured additively on the order and
 * shown on receipts for BAS; `totalCents` (the amount charged) is unaffected.
 */

export type TaxConfig = { enabled: boolean; rateBps: number; label: string };

const DEFAULT_TAX: TaxConfig = { enabled: false, rateBps: 0, label: "GST" };

/** Venue tax config, read separately from the money-path venue SELECT. */
export async function getVenueTaxConfig(venueId: string): Promise<TaxConfig> {
  const [row] = await db
    .select({
      enabled: venues.taxEnabled,
      rateBps: venues.taxRateBps,
      label: venues.taxLabel,
    })
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1);
  if (!row) return DEFAULT_TAX;
  return { enabled: row.enabled, rateBps: row.rateBps, label: row.label };
}

/**
 * The GST component contained in a GST-INCLUSIVE amount. For a 10% rate
 * (1000 bps) the component of $22.00 is $2.00: total × rate / (100% + rate).
 * Always ≤ the amount; half-up rounded to the cent.
 */
export function inclusiveTaxCents(inclusiveTotalCents: number, rateBps: number): number {
  if (rateBps <= 0 || inclusiveTotalCents <= 0) return 0;
  return Math.round((inclusiveTotalCents * rateBps) / (10000 + rateBps));
}
