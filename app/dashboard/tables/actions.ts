"use server";

import { and, asc, desc, eq, gt, lt, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { venueTables } from "@/lib/db/schema";
import { requireVenue, scopedToVenue, type Venue } from "@/lib/tenant";
import { idSchema, tableLabelSchema } from "@/lib/validation";

export type TablesActionState = { error?: string };

const TABLES_PATH = "/dashboard/tables";

const DUPLICATE_MESSAGE = "A table with that name already exists.";

/**
 * Server Functions are reachable via direct POST, so re-check auth on every
 * call before resolving the tenant. Unauthenticated -> /signin; authenticated
 * but no venue yet -> /onboarding (via requireVenue). These redirects throw a
 * control-flow signal, so callers must invoke this OUTSIDE any try/catch.
 */
async function requireVenueForAction(): Promise<Venue> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
  return requireVenue();
}

/** Next sort_order = MAX(sort_order)+1 among this venue's tables. */
async function nextTableSort(venueId: string): Promise<number> {
  const rows = await db
    .select({ sortOrder: venueTables.sortOrder })
    .from(venueTables)
    .where(scopedToVenue(venueTables.venueId, venueId))
    .orderBy(desc(venueTables.sortOrder))
    .limit(1);
  return (rows[0]?.sortOrder ?? -1) + 1;
}

/**
 * Is this label already used by another table in the venue? Case-insensitive,
 * matching the unique index on lower(label). `exceptId` skips the row being
 * edited so keeping its own name isn't flagged as a duplicate. This is a
 * friendly pre-check; the DB unique index (caught below) is the race-safe
 * guarantee.
 */
async function labelTaken(
  venueId: string,
  label: string,
  exceptId?: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: venueTables.id })
    .from(venueTables)
    .where(
      and(
        scopedToVenue(venueTables.venueId, venueId),
        sql`lower(${venueTables.label}) = lower(${label})`,
        exceptId ? ne(venueTables.id, exceptId) : undefined,
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** Postgres unique-violation — the race-safe backstop for the label index. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

export async function createTable(
  _prev: TablesActionState,
  formData: FormData,
): Promise<TablesActionState> {
  const venue = await requireVenueForAction();

  const parsed = tableLabelSchema.safeParse(formData.get("label") ?? "");
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  if (await labelTaken(venue.id, parsed.data)) {
    return { error: DUPLICATE_MESSAGE };
  }

  try {
    await db.insert(venueTables).values({
      venueId: venue.id,
      label: parsed.data,
      sortOrder: await nextTableSort(venue.id),
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { error: DUPLICATE_MESSAGE };
    throw error;
  }

  revalidatePath(TABLES_PATH);
  return {};
}

export async function updateTable(
  _prev: TablesActionState,
  formData: FormData,
): Promise<TablesActionState> {
  const venue = await requireVenueForAction();

  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { error: "Missing table." };

  const parsed = tableLabelSchema.safeParse(formData.get("label") ?? "");
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  if (await labelTaken(venue.id, parsed.data, id.data)) {
    return { error: DUPLICATE_MESSAGE };
  }

  try {
    // Scope by id AND venue_id; venue_id is never in the payload. The
    // .returning() length confirms the row existed and belonged to the venue.
    const updated = await db
      .update(venueTables)
      .set({ label: parsed.data })
      .where(
        and(
          eq(venueTables.id, id.data),
          scopedToVenue(venueTables.venueId, venue.id),
        ),
      )
      .returning({ id: venueTables.id });
    if (updated.length === 0) return { error: "Table not found." };
  } catch (error) {
    if (isUniqueViolation(error)) return { error: DUPLICATE_MESSAGE };
    throw error;
  }

  revalidatePath(TABLES_PATH);
  return {};
}

export async function deleteTable(formData: FormData): Promise<void> {
  const venue = await requireVenueForAction();
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return;

  await db
    .delete(venueTables)
    .where(
      and(
        eq(venueTables.id, id.data),
        scopedToVenue(venueTables.venueId, venue.id),
      ),
    );

  revalidatePath(TABLES_PATH);
}

export async function moveTable(formData: FormData): Promise<void> {
  const venue = await requireVenueForAction();
  const id = idSchema.safeParse(formData.get("id"));
  const direction = formData.get("direction");
  if (!id.success || (direction !== "up" && direction !== "down")) return;

  // Swap sort_order with the adjacent table in the move direction. Multi-row
  // write -> transaction; every statement scoped by venue_id.
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ id: venueTables.id, sortOrder: venueTables.sortOrder })
      .from(venueTables)
      .where(
        and(
          eq(venueTables.id, id.data),
          scopedToVenue(venueTables.venueId, venue.id),
        ),
      )
      .limit(1);
    if (!current) return;

    const [neighbor] = await tx
      .select({ id: venueTables.id, sortOrder: venueTables.sortOrder })
      .from(venueTables)
      .where(
        and(
          scopedToVenue(venueTables.venueId, venue.id),
          direction === "up"
            ? lt(venueTables.sortOrder, current.sortOrder)
            : gt(venueTables.sortOrder, current.sortOrder),
        ),
      )
      .orderBy(
        direction === "up"
          ? desc(venueTables.sortOrder)
          : asc(venueTables.sortOrder),
      )
      .limit(1);
    if (!neighbor) return;

    await tx
      .update(venueTables)
      .set({ sortOrder: neighbor.sortOrder })
      .where(
        and(
          eq(venueTables.id, current.id),
          scopedToVenue(venueTables.venueId, venue.id),
        ),
      );
    await tx
      .update(venueTables)
      .set({ sortOrder: current.sortOrder })
      .where(
        and(
          eq(venueTables.id, neighbor.id),
          scopedToVenue(venueTables.venueId, venue.id),
        ),
      );
  });

  revalidatePath(TABLES_PATH);
}
