"use server";

import { and, asc, desc, eq, gt, lt } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { menuCategories } from "@/lib/db/schema";
import { requireVenue, scopedToVenue, type Venue } from "@/lib/tenant";
import {
  categoryCreateSchema,
  categoryUpdateSchema,
  idSchema,
} from "@/lib/validation";

export type MenuActionState = { error?: string };

const MENU_PATH = "/dashboard/menu";

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

/** Next sort_order = MAX(sort_order)+1 within the venue (categories are top level). */
async function nextCategorySort(venueId: string): Promise<number> {
  const rows = await db
    .select({ sortOrder: menuCategories.sortOrder })
    .from(menuCategories)
    .where(scopedToVenue(menuCategories.venueId, venueId))
    .orderBy(desc(menuCategories.sortOrder))
    .limit(1);
  return (rows[0]?.sortOrder ?? -1) + 1;
}

export async function createCategory(
  _prev: MenuActionState,
  formData: FormData,
): Promise<MenuActionState> {
  const venue = await requireVenueForAction();

  const parsed = categoryCreateSchema.safeParse({
    name: formData.get("name") ?? "",
    description: formData.get("description") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  await db.insert(menuCategories).values({
    venueId: venue.id,
    name: parsed.data.name,
    description: parsed.data.description,
    sortOrder: await nextCategorySort(venue.id),
  });

  revalidatePath(MENU_PATH);
  return {};
}

export async function updateCategory(
  _prev: MenuActionState,
  formData: FormData,
): Promise<MenuActionState> {
  const venue = await requireVenueForAction();

  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { error: "Missing category." };

  const parsed = categoryUpdateSchema.safeParse({
    name: formData.get("name") ?? "",
    description: formData.get("description") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const isActive = formData.get("isActive") === "on";

  // IDOR-safe: scope the UPDATE by id AND venue_id; venue_id is never in the
  // payload (ownership is immutable). returning() length confirms a row was hit.
  const updated = await db
    .update(menuCategories)
    .set({
      name: parsed.data.name,
      description: parsed.data.description,
      isActive,
    })
    .where(
      and(
        eq(menuCategories.id, id.data),
        scopedToVenue(menuCategories.venueId, venue.id),
      ),
    )
    .returning({ id: menuCategories.id });
  if (updated.length === 0) return { error: "Category not found." };

  revalidatePath(MENU_PATH);
  return {};
}

export async function deleteCategory(formData: FormData): Promise<void> {
  const venue = await requireVenueForAction();
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return;

  // FK cascade removes items -> modifier groups -> options beneath. The UI
  // confirms before calling this.
  await db
    .delete(menuCategories)
    .where(
      and(
        eq(menuCategories.id, id.data),
        scopedToVenue(menuCategories.venueId, venue.id),
      ),
    );

  revalidatePath(MENU_PATH);
}

export async function moveCategory(formData: FormData): Promise<void> {
  const venue = await requireVenueForAction();
  const id = idSchema.safeParse(formData.get("id"));
  const direction = formData.get("direction");
  if (!id.success || (direction !== "up" && direction !== "down")) return;

  // Swap sort_order with the adjacent sibling in the move direction. Multi-row
  // write -> transaction; every statement scoped by venue_id.
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ id: menuCategories.id, sortOrder: menuCategories.sortOrder })
      .from(menuCategories)
      .where(
        and(
          eq(menuCategories.id, id.data),
          scopedToVenue(menuCategories.venueId, venue.id),
        ),
      )
      .limit(1);
    if (!current) return;

    const [neighbor] = await tx
      .select({ id: menuCategories.id, sortOrder: menuCategories.sortOrder })
      .from(menuCategories)
      .where(
        and(
          scopedToVenue(menuCategories.venueId, venue.id),
          direction === "up"
            ? lt(menuCategories.sortOrder, current.sortOrder)
            : gt(menuCategories.sortOrder, current.sortOrder),
        ),
      )
      .orderBy(
        direction === "up"
          ? desc(menuCategories.sortOrder)
          : asc(menuCategories.sortOrder),
      )
      .limit(1);
    if (!neighbor) return;

    await tx
      .update(menuCategories)
      .set({ sortOrder: neighbor.sortOrder })
      .where(
        and(
          eq(menuCategories.id, current.id),
          scopedToVenue(menuCategories.venueId, venue.id),
        ),
      );
    await tx
      .update(menuCategories)
      .set({ sortOrder: current.sortOrder })
      .where(
        and(
          eq(menuCategories.id, neighbor.id),
          scopedToVenue(menuCategories.venueId, venue.id),
        ),
      );
  });

  revalidatePath(MENU_PATH);
}
