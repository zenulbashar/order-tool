"use server";

import { and, desc, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { venues, venueStations } from "@/lib/db/schema";
import { normaliseStationCode } from "@/lib/orders/station";
import { requireVenue, scopedToVenue, type Venue } from "@/lib/tenant";
import { idSchema } from "@/lib/validation";

export type StationsSettingsState = { error?: string; success?: boolean };

const STATIONS_PATH = "/dashboard/settings/stations";
// The station config feeds two other surfaces, so refresh their caches too: the
// orders desk (which prints packaging/label dockets) and the menu editor (whose
// item form offers the "Label station" selector).
const ORDERS_PATH = "/dashboard/orders";
const MENU_PATH = "/dashboard/menu";

const DUPLICATE_MESSAGE = "That code is already used by another station.";

/**
 * Server Functions are reachable via direct POST, so re-check auth on every call
 * before resolving the tenant. Unauthenticated -> /signin; authenticated but no
 * venue -> /onboarding (via requireVenue). These redirects throw, so callers
 * must invoke this OUTSIDE any try/catch.
 */
async function requireVenueForAction(): Promise<Venue> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
  return requireVenue();
}

function revalidateStationConsumers(): void {
  revalidatePath(STATIONS_PATH);
  revalidatePath(ORDERS_PATH);
  revalidatePath(MENU_PATH);
}

/** Postgres unique-violation — the race-safe backstop for the (venue,code) index. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

/** Next sort_order = MAX(sort_order)+1 among this venue's stations. */
async function nextStationSort(venueId: string): Promise<number> {
  const rows = await db
    .select({ sortOrder: venueStations.sortOrder })
    .from(venueStations)
    .where(scopedToVenue(venueStations.venueId, venueId))
    .orderBy(desc(venueStations.sortOrder))
    .limit(1);
  return (rows[0]?.sortOrder ?? -1) + 1;
}

/**
 * Is this code already used by another station in the venue? Codes are stored
 * uppercased, so an exact match is exhaustive. `exceptId` skips the row being
 * edited. Friendly pre-check; the unique index is the race-safe guarantee.
 */
async function codeTaken(
  venueId: string,
  code: string,
  exceptId?: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: venueStations.id })
    .from(venueStations)
    .where(
      and(
        scopedToVenue(venueStations.venueId, venueId),
        eq(venueStations.code, code),
        exceptId ? ne(venueStations.id, exceptId) : undefined,
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** Validate a name + derive/validate its code from the form. */
function parseNameCode(
  formData: FormData,
): { name: string; code: string } | { error: string } {
  const name = String(formData.get("name") ?? "").trim();
  if (name.length === 0) return { error: "Give the station a name." };
  if (name.length > 40) {
    return { error: "Station names must be 40 characters or fewer." };
  }
  const code = normaliseStationCode(String(formData.get("code") ?? ""), name);
  if (code.length === 0) {
    return { error: "Give the station a one-to-three letter code." };
  }
  return { name, code };
}

export async function createStation(
  _prev: StationsSettingsState,
  formData: FormData,
): Promise<StationsSettingsState> {
  const venue = await requireVenueForAction();

  const parsed = parseNameCode(formData);
  if ("error" in parsed) return { error: parsed.error };

  if (await codeTaken(venue.id, parsed.code)) {
    return { error: DUPLICATE_MESSAGE };
  }

  const sortOrder = await nextStationSort(venue.id);
  try {
    await db.transaction(async (tx) => {
      await tx.insert(venueStations).values({
        venueId: venue.id,
        name: parsed.name,
        code: parsed.code,
        labelPrintEnabled: true,
        sortOrder,
      });
      // Adding a station turns the feature on so its prints actually surface on
      // the orders desk (mirrors onboarding, where >=1 station enables it).
      await tx
        .update(venues)
        .set({ stationPrintingEnabled: true })
        .where(eq(venues.id, venue.id));
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { error: DUPLICATE_MESSAGE };
    throw error;
  }

  revalidateStationConsumers();
  return { success: true };
}

export async function updateStation(
  _prev: StationsSettingsState,
  formData: FormData,
): Promise<StationsSettingsState> {
  const venue = await requireVenueForAction();

  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { error: "Missing station." };

  const parsed = parseNameCode(formData);
  if ("error" in parsed) return { error: parsed.error };

  if (await codeTaken(venue.id, parsed.code, id.data)) {
    return { error: DUPLICATE_MESSAGE };
  }

  try {
    // Scope by id AND venue_id; venue_id is never in the payload. The returning
    // length confirms the row existed and belonged to the venue.
    const updated = await db
      .update(venueStations)
      .set({ name: parsed.name, code: parsed.code })
      .where(
        and(
          eq(venueStations.id, id.data),
          scopedToVenue(venueStations.venueId, venue.id),
        ),
      )
      .returning({ id: venueStations.id });
    if (updated.length === 0) return { error: "Station not found." };
  } catch (error) {
    if (isUniqueViolation(error)) return { error: DUPLICATE_MESSAGE };
    throw error;
  }

  revalidateStationConsumers();
  return { success: true };
}

export async function deleteStation(formData: FormData): Promise<void> {
  const venue = await requireVenueForAction();
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return;

  // Menu items pointing at this station have station_id set to NULL by the FK
  // (onDelete: set null) — they stay on the receipt + packaging docket.
  await db
    .delete(venueStations)
    .where(
      and(
        eq(venueStations.id, id.data),
        scopedToVenue(venueStations.venueId, venue.id),
      ),
    );

  revalidateStationConsumers();
}

/** Master switch: whether the packaging + per-station prints are offered at all. */
export async function setStationPrinting(formData: FormData): Promise<void> {
  const venue = await requireVenueForAction();
  const enabled = formData.get("enable") === "on";

  await db
    .update(venues)
    .set({ stationPrintingEnabled: enabled })
    .where(eq(venues.id, venue.id));

  revalidateStationConsumers();
}

/** Per-station switch: whether this station's sticky label prints. */
export async function setStationLabel(formData: FormData): Promise<void> {
  const venue = await requireVenueForAction();
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return;
  const enabled = formData.get("enable") === "on";

  await db
    .update(venueStations)
    .set({ labelPrintEnabled: enabled })
    .where(
      and(
        eq(venueStations.id, id.data),
        scopedToVenue(venueStations.venueId, venue.id),
      ),
    );

  revalidateStationConsumers();
}
