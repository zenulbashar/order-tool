import { eq } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/lib/db";
import { venues } from "@/lib/db/schema";

import type { Plan } from "./plans";

/**
 * Server-only read of a venue's billing plan, by id (Phase 1).
 *
 * Deliberately separate from getPublicVenueBySlug: the venue's tier must NOT be
 * serialized to the client storefront, so `plan` is kept OFF the customer-safe
 * PublicVenue shape and read here instead, only where a server-side gate needs
 * it. This is the cost of zero client exposure — one extra indexed primary-key
 * lookup per gate check. Wrapped in React cache() so repeated checks within a
 * single request share one query.
 *
 * Returns null when no venue matches the id (the caller treats absence as "no
 * entitlement"); callers already hold a resolved venue, so this is defensive.
 */
export const getVenuePlan = cache(
  async (venueId: string): Promise<Plan | null> => {
    const rows = await db
      .select({ plan: venues.plan })
      .from(venues)
      .where(eq(venues.id, venueId))
      .limit(1);

    return rows[0]?.plan ?? null;
  },
);
