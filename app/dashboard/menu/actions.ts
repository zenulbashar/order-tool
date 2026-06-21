"use server";

import { and, asc, desc, eq, gt, lt } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { menuCategories, menuItems } from "@/lib/db/schema";
import { requireVenue, scopedToVenue, type Venue } from "@/lib/tenant";
import {
  categoryCreateSchema,
  categoryUpdateSchema,
  idSchema,
  itemCreateSchema,
  itemUpdateSchema,
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

/* ---------------------------------- Items --------------------------------- */

/** Parent-ownership: returns the category id only if it belongs to the venue. */
async function ownedCategoryId(
  venueId: string,
  categoryId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: menuCategories.id })
    .from(menuCategories)
    .where(
      and(
        eq(menuCategories.id, categoryId),
        scopedToVenue(menuCategories.venueId, venueId),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

/** Next sort_order = MAX(sort_order)+1 among items in the same category. */
async function nextItemSort(
  venueId: string,
  categoryId: string,
): Promise<number> {
  const rows = await db
    .select({ sortOrder: menuItems.sortOrder })
    .from(menuItems)
    .where(
      and(
        scopedToVenue(menuItems.venueId, venueId),
        eq(menuItems.categoryId, categoryId),
      ),
    )
    .orderBy(desc(menuItems.sortOrder))
    .limit(1);
  return (rows[0]?.sortOrder ?? -1) + 1;
}

export async function createItem(
  _prev: MenuActionState,
  formData: FormData,
): Promise<MenuActionState> {
  const venue = await requireVenueForAction();

  const categoryId = idSchema.safeParse(formData.get("categoryId"));
  if (!categoryId.success) return { error: "Missing category." };

  const parsed = itemCreateSchema.safeParse({
    name: formData.get("name") ?? "",
    description: formData.get("description") ?? "",
    priceCents: formData.get("price") ?? "",
    imageUrl: formData.get("imageUrl") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const owned = await ownedCategoryId(venue.id, categoryId.data);
  if (!owned) return { error: "Category not found." };

  await db.insert(menuItems).values({
    venueId: venue.id,
    categoryId: owned,
    name: parsed.data.name,
    description: parsed.data.description,
    priceCents: parsed.data.priceCents,
    imageUrl: parsed.data.imageUrl,
    sortOrder: await nextItemSort(venue.id, owned),
  });

  revalidatePath(MENU_PATH);
  return {};
}

export async function updateItem(
  _prev: MenuActionState,
  formData: FormData,
): Promise<MenuActionState> {
  const venue = await requireVenueForAction();

  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { error: "Missing item." };
  const categoryId = idSchema.safeParse(formData.get("categoryId"));
  if (!categoryId.success) return { error: "Missing category." };

  const parsed = itemUpdateSchema.safeParse({
    name: formData.get("name") ?? "",
    description: formData.get("description") ?? "",
    priceCents: formData.get("price") ?? "",
    imageUrl: formData.get("imageUrl") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const isAvailable = formData.get("isAvailable") === "on";

  // Reparenting guard: an edit can change the category, so the NEW category
  // must also belong to this venue before we point the item at it.
  const owned = await ownedCategoryId(venue.id, categoryId.data);
  if (!owned) return { error: "Category not found." };

  // IDOR-safe: scope by id AND venue_id; venue_id is never in the payload.
  const updated = await db
    .update(menuItems)
    .set({
      name: parsed.data.name,
      description: parsed.data.description,
      priceCents: parsed.data.priceCents,
      imageUrl: parsed.data.imageUrl,
      isAvailable,
      categoryId: owned,
    })
    .where(
      and(eq(menuItems.id, id.data), scopedToVenue(menuItems.venueId, venue.id)),
    )
    .returning({ id: menuItems.id });
  if (updated.length === 0) return { error: "Item not found." };

  revalidatePath(MENU_PATH);
  return {};
}

export async function deleteItem(formData: FormData): Promise<void> {
  const venue = await requireVenueForAction();
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return;

  await db
    .delete(menuItems)
    .where(
      and(eq(menuItems.id, id.data), scopedToVenue(menuItems.venueId, venue.id)),
    );

  revalidatePath(MENU_PATH);
}

export async function moveItem(formData: FormData): Promise<void> {
  const venue = await requireVenueForAction();
  const id = idSchema.safeParse(formData.get("id"));
  const direction = formData.get("direction");
  if (!id.success || (direction !== "up" && direction !== "down")) return;

  // Reorder within the item's own category (siblings only). Multi-row write.
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        id: menuItems.id,
        sortOrder: menuItems.sortOrder,
        categoryId: menuItems.categoryId,
      })
      .from(menuItems)
      .where(
        and(
          eq(menuItems.id, id.data),
          scopedToVenue(menuItems.venueId, venue.id),
        ),
      )
      .limit(1);
    if (!current) return;

    const [neighbor] = await tx
      .select({ id: menuItems.id, sortOrder: menuItems.sortOrder })
      .from(menuItems)
      .where(
        and(
          scopedToVenue(menuItems.venueId, venue.id),
          eq(menuItems.categoryId, current.categoryId),
          direction === "up"
            ? lt(menuItems.sortOrder, current.sortOrder)
            : gt(menuItems.sortOrder, current.sortOrder),
        ),
      )
      .orderBy(
        direction === "up"
          ? desc(menuItems.sortOrder)
          : asc(menuItems.sortOrder),
      )
      .limit(1);
    if (!neighbor) return;

    await tx
      .update(menuItems)
      .set({ sortOrder: neighbor.sortOrder })
      .where(
        and(
          eq(menuItems.id, current.id),
          scopedToVenue(menuItems.venueId, venue.id),
        ),
      );
    await tx
      .update(menuItems)
      .set({ sortOrder: current.sortOrder })
      .where(
        and(
          eq(menuItems.id, neighbor.id),
          scopedToVenue(menuItems.venueId, venue.id),
        ),
      );
  });

  revalidatePath(MENU_PATH);
}
