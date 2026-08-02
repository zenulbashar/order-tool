import { asc } from "drizzle-orm";

import { db } from "@/lib/db";
import { venueStations } from "@/lib/db/schema";
import { requireWizardVenue, scopedToVenue } from "@/lib/tenant";

import { WizardProgress } from "../_components/wizard-progress";
import { StationsForm } from "./stations-form";

// Reads the venue's saved stations so a resumed wizard pre-fills them.
export const dynamic = "force-dynamic";

export default async function StationsStepPage() {
  // No venue -> redirects to /onboarding, which routes to Step 1. Already live
  // -> back to the dashboard: the form below submits a REPLACE-SET, which is
  // only safe while no item→station assignments exist yet.
  const venue = await requireWizardVenue();

  const saved = await db
    .select({
      name: venueStations.name,
      code: venueStations.code,
      labelPrintEnabled: venueStations.labelPrintEnabled,
    })
    .from(venueStations)
    .where(scopedToVenue(venueStations.venueId, venue.id))
    .orderBy(asc(venueStations.sortOrder), asc(venueStations.name));

  return (
    <div className="space-y-6">
      <WizardProgress current={4} />
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
          Prep stations &amp; printing
        </h1>
        <p className="text-sm text-muted">
          Set up the counters that plate their own items. We&rsquo;ll route each
          order to the right station labels.
        </p>
      </div>
      <StationsForm
        defaults={{
          stations: saved.map((s) => ({ name: s.name, code: s.code })),
          // Any saved station with labels on ⇒ the sticky-print answer was "yes".
          stickyPrint: saved.some((s) => s.labelPrintEnabled),
        }}
      />
    </div>
  );
}
