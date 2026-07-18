import { asc } from "drizzle-orm";

import { Card } from "@/app/_components/card";
import { PageHeader } from "@/app/_components/page-header";
import { db } from "@/lib/db";
import { venueStations } from "@/lib/db/schema";
import { requireUser, requireVenue, scopedToVenue } from "@/lib/tenant";

import { StationsEditor } from "./stations-editor";

// Reads live station rows every request; never prerendered.
export const dynamic = "force-dynamic";

export default async function StationsSettingsPage() {
  await requireUser();
  const venue = await requireVenue();

  const stations = await db
    .select({
      id: venueStations.id,
      name: venueStations.name,
      code: venueStations.code,
      labelPrintEnabled: venueStations.labelPrintEnabled,
    })
    .from(venueStations)
    .where(scopedToVenue(venueStations.venueId, venue.id))
    .orderBy(asc(venueStations.sortOrder), asc(venueStations.name));

  return (
    <main className="mx-auto max-w-3xl">
      <PageHeader
        title="Prep stations"
        backHref="/dashboard/settings"
        description="Counters that plate their own items. Each can print a separate sticky label showing only its items (no prices), headed by the order number and station code — e.g. 42-K. Route menu items to a station from the item’s “Label station” field."
      />
      <section className="px-5 py-8">
        <Card>
          <StationsEditor
            stations={stations}
            printingEnabled={venue.stationPrintingEnabled}
          />
        </Card>
      </section>
    </main>
  );
}
