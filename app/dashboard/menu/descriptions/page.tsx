import { and, eq, isNull, or } from "drizzle-orm";

import { PageHeader } from "@/app/_components/page-header";
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
    <main className="mx-auto w-full max-w-[1600px]">
      <PageHeader
        title="Fill empty descriptions"
        description={venue.name}
        backHref="/dashboard/menu"
      />

      <div className="max-w-3xl px-5">
        <DescriptionsClient emptyCount={empties.length} />
      </div>
    </main>
  );
}
