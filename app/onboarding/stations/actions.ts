"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { venues, venueStations } from "@/lib/db/schema";
import { requireUser, requireVenue } from "@/lib/tenant";

export type StationsState = { error?: string };

/** Hard cap on how many prep stations onboarding will take, to keep it sane. */
export const MAX_STATIONS = 8;

/** A parsed station row from the wizard form (pre-validation). */
type ParsedStation = { name: string; code: string };

/**
 * Normalise a station code: uppercased, letters/digits only, 1-3 chars. Empty
 * after cleaning → derive from the name's first alphanumeric character so a
 * station always has a usable initial. Mirrors the DB CHECK (1..3 chars).
 */
function normaliseCode(rawCode: string, name: string): string {
  const cleaned = rawCode.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 3);
  if (cleaned.length > 0) return cleaned;
  const fromName = name.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 1);
  return fromName;
}

/**
 * Onboarding "Stations" step — record the venue's prep stations (apart from the
 * front counter) and whether each prints its own sticky label.
 *
 * Writes are display-only routing config: it replace-sets venue_stations for the
 * venue and flips venues.station_printing_enabled. Replace-set is safe here
 * because item→station assignments are made later in the menu editor, not during
 * onboarding — so re-running this step can't strand assignments that don't exist
 * yet. Advances the resume pointer to Step 5 (plan) and routes forward.
 *
 * "0 stations" is a valid answer (the venue prints one ticket, as before):
 * station printing stays off and no rows are written.
 */
export async function saveStations(
  _prev: StationsState,
  formData: FormData,
): Promise<StationsState> {
  await requireUser();
  const venue = await requireVenue();

  const count = Number(formData.get("stationCount"));
  if (!Number.isInteger(count) || count < 0 || count > MAX_STATIONS) {
    return { error: "Choose a number of stations between 0 and 8." };
  }

  // No stations: keep the single-ticket setup, clear any previously saved rows.
  if (count === 0) {
    await db.transaction(async (tx) => {
      await tx.delete(venueStations).where(eq(venueStations.venueId, venue.id));
      await tx
        .update(venues)
        .set({ stationPrintingEnabled: false, onboardingStep: 5 })
        .where(eq(venues.id, venue.id));
    });
    redirect("/onboarding/plan");
  }

  const stickyPrint = formData.get("stickyPrint") === "on";

  const parsed: ParsedStation[] = [];
  for (let i = 0; i < count; i++) {
    const name = String(formData.get(`name_${i}`) ?? "").trim();
    if (name.length === 0) {
      return { error: `Give station ${i + 1} a name.` };
    }
    if (name.length > 40) {
      return { error: "Station names must be 40 characters or fewer." };
    }
    const code = normaliseCode(String(formData.get(`code_${i}`) ?? ""), name);
    if (code.length === 0) {
      return { error: `Give station ${i + 1} a one-to-three letter code.` };
    }
    parsed.push({ name, code });
  }

  // Codes must be unique within the venue so "42-K" points at one station.
  const seen = new Set<string>();
  for (const station of parsed) {
    if (seen.has(station.code)) {
      return {
        error: `Two stations share the code "${station.code}". Give each a different code.`,
      };
    }
    seen.add(station.code);
  }

  await db.transaction(async (tx) => {
    await tx.delete(venueStations).where(eq(venueStations.venueId, venue.id));
    await tx.insert(venueStations).values(
      parsed.map((station, index) => ({
        venueId: venue.id,
        name: station.name,
        code: station.code,
        labelPrintEnabled: stickyPrint,
        sortOrder: index,
      })),
    );
    await tx
      .update(venues)
      .set({ stationPrintingEnabled: true, onboardingStep: 5 })
      .where(eq(venues.id, venue.id));
  });

  redirect("/onboarding/plan");
}
