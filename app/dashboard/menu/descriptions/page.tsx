import Link from "next/link";
import { and, eq, isNull, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { menuItems } from "@/lib/db/schema";
import { requireUser, requireVenue, scopedToVenue } from "@/lib/tenant";

import { DescriptionsClient } from "./descriptions-client";

export default async function FillDescriptionsPage() {
  await requireUser();
  const venue = await requireVenue();

  // Count description-less items up front (venue-scoped) so the client can show
  // the work size and the empty-state without making an API call. Empty = NULL
  // (how the manual + import CRUD store blank) or "" defensively.
  const empties = await db
    .select({ id: menuItems.id })
    .from(menuItems)
    .where(
      and(
        scopedToVenue(menuItems.venueId, venue.id),
        or(isNull(menuItems.description), eq(menuItems.description, "")),
      ),
    );

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="border-b border-gray-200 pb-6">
        <Link
          href="/dashboard/menu"
          className="text-xs text-gray-500 hover:text-gray-900"
        >
          ← Back to menu
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Fill empty descriptions
        </h1>
        <p className="text-sm text-gray-500">{venue.name}</p>
      </header>

      <DescriptionsClient emptyCount={empties.length} />
    </main>
  );
}
