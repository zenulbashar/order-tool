"use server";

import { and, asc, desc, eq, gt, lt } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  menuCategories,
  menuItems,
  menuItemVariants,
  modifierGroups,
  modifierOptions,
} from "@/lib/db/schema";
import {
  deleteFromR2,
  r2KeyFromPublicUrl,
  uploadToR2,
} from "@/lib/r2";
import { requireVenue, scopedToVenue, type Venue } from "@/lib/tenant";
import {
  categoryCreateSchema,
  categoryUpdateSchema,
  groupCreateSchema,
  groupUpdateSchema,
  idSchema,
  itemCreateSchema,
  itemUpdateSchema,
  optionCreateSchema,
  optionUpdateSchema,
  variantCreateSchema,
  variantUpdateSchema,
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

/** Option price delta defaults to 0 when the field is left blank. */
function priceDeltaInput(formData: FormData): string {
  const raw = String(formData.get("priceDelta") ?? "").trim();
  return raw.length > 0 ? raw : "0";
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
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const owned = await ownedCategoryId(venue.id, categoryId.data);
  if (!owned) return { error: "Category not found." };

  // New items start with no photo; image_url is set later via uploadItemPhoto.
  await db.insert(menuItems).values({
    venueId: venue.id,
    categoryId: owned,
    name: parsed.data.name,
    description: parsed.data.description,
    priceCents: parsed.data.priceCents,
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
  // image_url is DELIBERATELY not in this set — the photo is owned by the
  // upload/remove actions, so editing name/price/etc. never wipes it.
  const updated = await db
    .update(menuItems)
    .set({
      name: parsed.data.name,
      description: parsed.data.description,
      priceCents: parsed.data.priceCents,
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

/* -------------------------------- Item photo ------------------------------ */
/* Real owner-uploaded photos stored in Cloudflare R2 (server-side upload, never */
/* browser->R2). The public URL is written to menu_items.image_url. Validation   */
/* (type + size + parent-ownership) is the REAL gate, enforced server-side       */
/* regardless of any client check. Old objects are cleaned up best-effort.       */

const PHOTO_MAX_BYTES = 5 * 1024 * 1024; // 5MB
// Allowed upload types -> file extension used in the object key.
const PHOTO_TYPE_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Read the item's current photo URL (id + venue scoped), or null. */
async function currentItemImageUrl(
  venueId: string,
  itemId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ imageUrl: menuItems.imageUrl })
    .from(menuItems)
    .where(
      and(eq(menuItems.id, itemId), scopedToVenue(menuItems.venueId, venueId)),
    )
    .limit(1);
  return row?.imageUrl ?? null;
}

/** Best-effort delete of an R2 object behind a stored public URL. Never throws. */
async function bestEffortDeletePhoto(url: string | null): Promise<void> {
  if (!url) return;
  const key = r2KeyFromPublicUrl(url);
  if (!key) return; // not an object we manage (e.g. a legacy pasted URL)
  try {
    await deleteFromR2(key);
  } catch {
    // Cleanup is best-effort: a leftover object is harmless and must never
    // fail the owner's request.
  }
}

export async function uploadItemPhoto(
  _prev: MenuActionState,
  formData: FormData,
): Promise<MenuActionState> {
  const venue = await requireVenueForAction();

  const itemId = idSchema.safeParse(formData.get("itemId"));
  if (!itemId.success) return { error: "Missing item." };

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a photo to upload." };
  }
  // Server-side validation is the real gate (independent of any client check).
  if (file.size > PHOTO_MAX_BYTES) {
    return { error: "Photo must be 5MB or smaller." };
  }
  const ext = PHOTO_TYPE_EXT[file.type];
  if (!ext) {
    return { error: "Photo must be a JPEG, PNG, or WebP image." };
  }

  // Parent-ownership (IDOR gate): the item must belong to this venue.
  const owned = await ownedItemId(venue.id, itemId.data);
  if (!owned) return { error: "Item not found." };

  // Capture the existing photo first so we can clean it up after a successful
  // replace.
  const previousUrl = await currentItemImageUrl(venue.id, owned);

  // Collision-safe key namespaced by venue + item.
  const key = `venues/${venue.id}/items/${owned}/${crypto.randomUUID()}.${ext}`;

  let publicUrl: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    publicUrl = await uploadToR2(key, buffer, file.type);
  } catch {
    // Upload failed (network, or R2 not configured) — leave the DB untouched.
    return {
      error: "Couldn't upload the photo right now. Please try again.",
    };
  }

  // IDOR-safe write: scope by id AND venue_id; row assertion confirms a hit.
  const updated = await db
    .update(menuItems)
    .set({ imageUrl: publicUrl })
    .where(
      and(eq(menuItems.id, owned), scopedToVenue(menuItems.venueId, venue.id)),
    )
    .returning({ id: menuItems.id });

  if (updated.length === 0) {
    // The item vanished between the ownership check and the write — don't orphan
    // the just-uploaded object.
    await bestEffortDeletePhoto(publicUrl);
    return { error: "Item not found." };
  }

  // Replace succeeded — remove the previous object (best-effort).
  await bestEffortDeletePhoto(previousUrl);

  revalidatePath(MENU_PATH);
  return {};
}

export async function removeItemPhoto(formData: FormData): Promise<void> {
  const venue = await requireVenueForAction();
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return;

  const previousUrl = await currentItemImageUrl(venue.id, id.data);

  // Venue-scoped clear of the photo column.
  await db
    .update(menuItems)
    .set({ imageUrl: null })
    .where(
      and(eq(menuItems.id, id.data), scopedToVenue(menuItems.venueId, venue.id)),
    );

  await bestEffortDeletePhoto(previousUrl);

  revalidatePath(MENU_PATH);
}

/* ------------------------------ Modifier groups --------------------------- */

/** Parent-ownership: returns the item id only if it belongs to the venue. */
async function ownedItemId(
  venueId: string,
  itemId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: menuItems.id })
    .from(menuItems)
    .where(
      and(eq(menuItems.id, itemId), scopedToVenue(menuItems.venueId, venueId)),
    )
    .limit(1);
  return row?.id ?? null;
}

/** Next sort_order = MAX(sort_order)+1 among groups on the same item. */
async function nextGroupSort(
  venueId: string,
  itemId: string,
): Promise<number> {
  const rows = await db
    .select({ sortOrder: modifierGroups.sortOrder })
    .from(modifierGroups)
    .where(
      and(
        scopedToVenue(modifierGroups.venueId, venueId),
        eq(modifierGroups.itemId, itemId),
      ),
    )
    .orderBy(desc(modifierGroups.sortOrder))
    .limit(1);
  return (rows[0]?.sortOrder ?? -1) + 1;
}

export async function createGroup(
  _prev: MenuActionState,
  formData: FormData,
): Promise<MenuActionState> {
  const venue = await requireVenueForAction();

  const itemId = idSchema.safeParse(formData.get("itemId"));
  if (!itemId.success) return { error: "Missing item." };

  const parsed = groupCreateSchema.safeParse({
    name: formData.get("name") ?? "",
    minSelect: formData.get("minSelect") ?? "",
    maxSelect: formData.get("maxSelect") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const owned = await ownedItemId(venue.id, itemId.data);
  if (!owned) return { error: "Item not found." };

  await db.insert(modifierGroups).values({
    venueId: venue.id,
    itemId: owned,
    name: parsed.data.name,
    minSelect: parsed.data.minSelect,
    maxSelect: parsed.data.maxSelect,
    sortOrder: await nextGroupSort(venue.id, owned),
  });

  revalidatePath(MENU_PATH);
  return {};
}

export async function updateGroup(
  _prev: MenuActionState,
  formData: FormData,
): Promise<MenuActionState> {
  const venue = await requireVenueForAction();

  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { error: "Missing group." };

  const parsed = groupUpdateSchema.safeParse({
    name: formData.get("name") ?? "",
    minSelect: formData.get("minSelect") ?? "",
    maxSelect: formData.get("maxSelect") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  // item_id is immutable on edit; scope by id AND venue_id, no venue_id in set.
  const updated = await db
    .update(modifierGroups)
    .set({
      name: parsed.data.name,
      minSelect: parsed.data.minSelect,
      maxSelect: parsed.data.maxSelect,
    })
    .where(
      and(
        eq(modifierGroups.id, id.data),
        scopedToVenue(modifierGroups.venueId, venue.id),
      ),
    )
    .returning({ id: modifierGroups.id });
  if (updated.length === 0) return { error: "Group not found." };

  revalidatePath(MENU_PATH);
  return {};
}

export async function deleteGroup(formData: FormData): Promise<void> {
  const venue = await requireVenueForAction();
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return;

  // FK cascade removes this group's options. The UI confirms.
  await db
    .delete(modifierGroups)
    .where(
      and(
        eq(modifierGroups.id, id.data),
        scopedToVenue(modifierGroups.venueId, venue.id),
      ),
    );

  revalidatePath(MENU_PATH);
}

export async function moveGroup(formData: FormData): Promise<void> {
  const venue = await requireVenueForAction();
  const id = idSchema.safeParse(formData.get("id"));
  const direction = formData.get("direction");
  if (!id.success || (direction !== "up" && direction !== "down")) return;

  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        id: modifierGroups.id,
        sortOrder: modifierGroups.sortOrder,
        itemId: modifierGroups.itemId,
      })
      .from(modifierGroups)
      .where(
        and(
          eq(modifierGroups.id, id.data),
          scopedToVenue(modifierGroups.venueId, venue.id),
        ),
      )
      .limit(1);
    if (!current) return;

    const [neighbor] = await tx
      .select({ id: modifierGroups.id, sortOrder: modifierGroups.sortOrder })
      .from(modifierGroups)
      .where(
        and(
          scopedToVenue(modifierGroups.venueId, venue.id),
          eq(modifierGroups.itemId, current.itemId),
          direction === "up"
            ? lt(modifierGroups.sortOrder, current.sortOrder)
            : gt(modifierGroups.sortOrder, current.sortOrder),
        ),
      )
      .orderBy(
        direction === "up"
          ? desc(modifierGroups.sortOrder)
          : asc(modifierGroups.sortOrder),
      )
      .limit(1);
    if (!neighbor) return;

    await tx
      .update(modifierGroups)
      .set({ sortOrder: neighbor.sortOrder })
      .where(
        and(
          eq(modifierGroups.id, current.id),
          scopedToVenue(modifierGroups.venueId, venue.id),
        ),
      );
    await tx
      .update(modifierGroups)
      .set({ sortOrder: current.sortOrder })
      .where(
        and(
          eq(modifierGroups.id, neighbor.id),
          scopedToVenue(modifierGroups.venueId, venue.id),
        ),
      );
  });

  revalidatePath(MENU_PATH);
}

/* ----------------------------- Modifier options --------------------------- */

/** Parent-ownership: returns the group id only if it belongs to the venue. */
async function ownedGroupId(
  venueId: string,
  groupId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: modifierGroups.id })
    .from(modifierGroups)
    .where(
      and(
        eq(modifierGroups.id, groupId),
        scopedToVenue(modifierGroups.venueId, venueId),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

/** Next sort_order = MAX(sort_order)+1 among options in the same group. */
async function nextOptionSort(
  venueId: string,
  groupId: string,
): Promise<number> {
  const rows = await db
    .select({ sortOrder: modifierOptions.sortOrder })
    .from(modifierOptions)
    .where(
      and(
        scopedToVenue(modifierOptions.venueId, venueId),
        eq(modifierOptions.groupId, groupId),
      ),
    )
    .orderBy(desc(modifierOptions.sortOrder))
    .limit(1);
  return (rows[0]?.sortOrder ?? -1) + 1;
}

export async function createOption(
  _prev: MenuActionState,
  formData: FormData,
): Promise<MenuActionState> {
  const venue = await requireVenueForAction();

  const groupId = idSchema.safeParse(formData.get("groupId"));
  if (!groupId.success) return { error: "Missing group." };

  const parsed = optionCreateSchema.safeParse({
    name: formData.get("name") ?? "",
    priceDeltaCents: priceDeltaInput(formData),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const owned = await ownedGroupId(venue.id, groupId.data);
  if (!owned) return { error: "Group not found." };

  await db.insert(modifierOptions).values({
    venueId: venue.id,
    groupId: owned,
    name: parsed.data.name,
    priceDeltaCents: parsed.data.priceDeltaCents,
    sortOrder: await nextOptionSort(venue.id, owned),
  });

  revalidatePath(MENU_PATH);
  return {};
}

export async function updateOption(
  _prev: MenuActionState,
  formData: FormData,
): Promise<MenuActionState> {
  const venue = await requireVenueForAction();

  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { error: "Missing option." };

  const parsed = optionUpdateSchema.safeParse({
    name: formData.get("name") ?? "",
    priceDeltaCents: priceDeltaInput(formData),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const isAvailable = formData.get("isAvailable") === "on";

  // group_id is immutable on edit; scope by id AND venue_id, no venue_id in set.
  const updated = await db
    .update(modifierOptions)
    .set({
      name: parsed.data.name,
      priceDeltaCents: parsed.data.priceDeltaCents,
      isAvailable,
    })
    .where(
      and(
        eq(modifierOptions.id, id.data),
        scopedToVenue(modifierOptions.venueId, venue.id),
      ),
    )
    .returning({ id: modifierOptions.id });
  if (updated.length === 0) return { error: "Option not found." };

  revalidatePath(MENU_PATH);
  return {};
}

export async function deleteOption(formData: FormData): Promise<void> {
  const venue = await requireVenueForAction();
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return;

  await db
    .delete(modifierOptions)
    .where(
      and(
        eq(modifierOptions.id, id.data),
        scopedToVenue(modifierOptions.venueId, venue.id),
      ),
    );

  revalidatePath(MENU_PATH);
}

export async function moveOption(formData: FormData): Promise<void> {
  const venue = await requireVenueForAction();
  const id = idSchema.safeParse(formData.get("id"));
  const direction = formData.get("direction");
  if (!id.success || (direction !== "up" && direction !== "down")) return;

  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        id: modifierOptions.id,
        sortOrder: modifierOptions.sortOrder,
        groupId: modifierOptions.groupId,
      })
      .from(modifierOptions)
      .where(
        and(
          eq(modifierOptions.id, id.data),
          scopedToVenue(modifierOptions.venueId, venue.id),
        ),
      )
      .limit(1);
    if (!current) return;

    const [neighbor] = await tx
      .select({ id: modifierOptions.id, sortOrder: modifierOptions.sortOrder })
      .from(modifierOptions)
      .where(
        and(
          scopedToVenue(modifierOptions.venueId, venue.id),
          eq(modifierOptions.groupId, current.groupId),
          direction === "up"
            ? lt(modifierOptions.sortOrder, current.sortOrder)
            : gt(modifierOptions.sortOrder, current.sortOrder),
        ),
      )
      .orderBy(
        direction === "up"
          ? desc(modifierOptions.sortOrder)
          : asc(modifierOptions.sortOrder),
      )
      .limit(1);
    if (!neighbor) return;

    await tx
      .update(modifierOptions)
      .set({ sortOrder: neighbor.sortOrder })
      .where(
        and(
          eq(modifierOptions.id, current.id),
          scopedToVenue(modifierOptions.venueId, venue.id),
        ),
      );
    await tx
      .update(modifierOptions)
      .set({ sortOrder: current.sortOrder })
      .where(
        and(
          eq(modifierOptions.id, neighbor.id),
          scopedToVenue(modifierOptions.venueId, venue.id),
        ),
      );
  });

  revalidatePath(MENU_PATH);
}

/* ----------------------------- Item size variants ------------------------- */
/* Variants attach to an item (parent-ownership via the existing ownedItemId,  */
/* same as modifier groups). Price is ABSOLUTE and required — read from the    */
/* `price` field like the item price, not the option's optional delta.         */

/** Next sort_order = MAX(sort_order)+1 among variants on the same item. */
async function nextVariantSort(
  venueId: string,
  itemId: string,
): Promise<number> {
  const rows = await db
    .select({ sortOrder: menuItemVariants.sortOrder })
    .from(menuItemVariants)
    .where(
      and(
        scopedToVenue(menuItemVariants.venueId, venueId),
        eq(menuItemVariants.itemId, itemId),
      ),
    )
    .orderBy(desc(menuItemVariants.sortOrder))
    .limit(1);
  return (rows[0]?.sortOrder ?? -1) + 1;
}

export async function createVariant(
  _prev: MenuActionState,
  formData: FormData,
): Promise<MenuActionState> {
  const venue = await requireVenueForAction();

  const itemId = idSchema.safeParse(formData.get("itemId"));
  if (!itemId.success) return { error: "Missing item." };

  const parsed = variantCreateSchema.safeParse({
    name: formData.get("name") ?? "",
    priceCents: formData.get("price") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const owned = await ownedItemId(venue.id, itemId.data);
  if (!owned) return { error: "Item not found." };

  await db.insert(menuItemVariants).values({
    venueId: venue.id,
    itemId: owned,
    name: parsed.data.name,
    priceCents: parsed.data.priceCents,
    sortOrder: await nextVariantSort(venue.id, owned),
  });

  revalidatePath(MENU_PATH);
  return {};
}

export async function updateVariant(
  _prev: MenuActionState,
  formData: FormData,
): Promise<MenuActionState> {
  const venue = await requireVenueForAction();

  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { error: "Missing size." };

  const parsed = variantUpdateSchema.safeParse({
    name: formData.get("name") ?? "",
    priceCents: formData.get("price") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  // item_id is immutable on edit; scope by id AND venue_id, no venue_id in set.
  const updated = await db
    .update(menuItemVariants)
    .set({
      name: parsed.data.name,
      priceCents: parsed.data.priceCents,
    })
    .where(
      and(
        eq(menuItemVariants.id, id.data),
        scopedToVenue(menuItemVariants.venueId, venue.id),
      ),
    )
    .returning({ id: menuItemVariants.id });
  if (updated.length === 0) return { error: "Size not found." };

  revalidatePath(MENU_PATH);
  return {};
}

export async function deleteVariant(formData: FormData): Promise<void> {
  const venue = await requireVenueForAction();
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return;

  await db
    .delete(menuItemVariants)
    .where(
      and(
        eq(menuItemVariants.id, id.data),
        scopedToVenue(menuItemVariants.venueId, venue.id),
      ),
    );

  revalidatePath(MENU_PATH);
}

export async function moveVariant(formData: FormData): Promise<void> {
  const venue = await requireVenueForAction();
  const id = idSchema.safeParse(formData.get("id"));
  const direction = formData.get("direction");
  if (!id.success || (direction !== "up" && direction !== "down")) return;

  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        id: menuItemVariants.id,
        sortOrder: menuItemVariants.sortOrder,
        itemId: menuItemVariants.itemId,
      })
      .from(menuItemVariants)
      .where(
        and(
          eq(menuItemVariants.id, id.data),
          scopedToVenue(menuItemVariants.venueId, venue.id),
        ),
      )
      .limit(1);
    if (!current) return;

    const [neighbor] = await tx
      .select({
        id: menuItemVariants.id,
        sortOrder: menuItemVariants.sortOrder,
      })
      .from(menuItemVariants)
      .where(
        and(
          scopedToVenue(menuItemVariants.venueId, venue.id),
          eq(menuItemVariants.itemId, current.itemId),
          direction === "up"
            ? lt(menuItemVariants.sortOrder, current.sortOrder)
            : gt(menuItemVariants.sortOrder, current.sortOrder),
        ),
      )
      .orderBy(
        direction === "up"
          ? desc(menuItemVariants.sortOrder)
          : asc(menuItemVariants.sortOrder),
      )
      .limit(1);
    if (!neighbor) return;

    await tx
      .update(menuItemVariants)
      .set({ sortOrder: neighbor.sortOrder })
      .where(
        and(
          eq(menuItemVariants.id, current.id),
          scopedToVenue(menuItemVariants.venueId, venue.id),
        ),
      );
    await tx
      .update(menuItemVariants)
      .set({ sortOrder: current.sortOrder })
      .where(
        and(
          eq(menuItemVariants.id, neighbor.id),
          scopedToVenue(menuItemVariants.venueId, venue.id),
        ),
      );
  });

  revalidatePath(MENU_PATH);
}
