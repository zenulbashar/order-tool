"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { menuItems, venueImages } from "@/lib/db/schema";
import { deleteFromR2, r2KeyFromPublicUrl, uploadToR2 } from "@/lib/r2";
import { requireVenue } from "@/lib/tenant";

export type MediaState = { error?: string };

const MEDIA_PATH = "/dashboard/media";
const MENU_PATH = "/dashboard/menu";
const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const TYPE_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Upload an image into the current venue's shared library. */
export async function uploadLibraryImage(
  _prev: MediaState,
  formData: FormData,
): Promise<MediaState> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
  const venue = await requireVenue();

  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an image to upload." };
  }
  if (file.size > MAX_BYTES) {
    return { error: "Image must be 5MB or smaller." };
  }
  const ext = TYPE_EXT[file.type];
  if (!ext) {
    return { error: "Image must be a JPEG, PNG, or WebP." };
  }

  const key = `venues/${venue.id}/library/${crypto.randomUUID()}.${ext}`;
  let url: string;
  try {
    url = await uploadToR2(key, Buffer.from(await file.arrayBuffer()), file.type);
  } catch {
    return { error: "Couldn't upload the image right now. Please try again." };
  }

  await db.insert(venueImages).values({ venueId: venue.id, url });
  revalidatePath(MEDIA_PATH);
  return {};
}

/**
 * Delete a library image. First DETACH it from any menu items that reference it
 * (set image_url = null) so nothing is left showing a broken image, then remove
 * the R2 object and the row. Scoped to the session venue (IDOR-safe).
 */
export async function deleteLibraryImage(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
  const venue = await requireVenue();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const [img] = await db
    .select({ url: venueImages.url })
    .from(venueImages)
    .where(and(eq(venueImages.id, id), eq(venueImages.venueId, venue.id)))
    .limit(1);
  if (!img) return;

  // Detach from any items using it (venue-scoped) BEFORE deleting the object.
  await db
    .update(menuItems)
    .set({ imageUrl: null })
    .where(and(eq(menuItems.venueId, venue.id), eq(menuItems.imageUrl, img.url)));

  const key = r2KeyFromPublicUrl(img.url);
  if (key) {
    try {
      await deleteFromR2(key);
    } catch {
      // Best-effort — a leftover object is harmless and must not fail the delete.
    }
  }

  await db
    .delete(venueImages)
    .where(and(eq(venueImages.id, id), eq(venueImages.venueId, venue.id)));

  revalidatePath(MEDIA_PATH);
  revalidatePath(MENU_PATH);
}

/** The current venue's library images (newest first) — for the item picker. */
export async function listVenueImages(): Promise<{ id: string; url: string }[]> {
  const session = await auth();
  if (!session?.user?.id) return [];
  const venue = await requireVenue();
  return db
    .select({ id: venueImages.id, url: venueImages.url })
    .from(venueImages)
    .where(eq(venueImages.venueId, venue.id))
    .orderBy(desc(venueImages.createdAt));
}
