import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";

import { Card } from "@/app/_components/card";
import { PageHeader } from "@/app/_components/page-header";
import { db } from "@/lib/db";
import { venueImages } from "@/lib/db/schema";
import { requireUser, requireVenue } from "@/lib/tenant";

import { deleteLibraryImage } from "./actions";
import { LibraryUpload } from "./library-upload";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Media library" };

/**
 * Venue image library (Square parity, quick-win #6). Owners upload reusable
 * images here and attach them to menu items from the item editor ("Choose from
 * library"). Deleting detaches the image from any items using it first, so
 * nothing is ever left showing a broken image.
 */
export default async function MediaPage() {
  await requireUser();
  const venue = await requireVenue();

  const images = await db
    .select({
      id: venueImages.id,
      url: venueImages.url,
      createdAt: venueImages.createdAt,
    })
    .from(venueImages)
    .where(eq(venueImages.venueId, venue.id))
    .orderBy(desc(venueImages.createdAt));

  return (
    <main className="mx-auto max-w-4xl">
      <PageHeader
        title="Media library"
        description="Upload images once, reuse them across your menu"
      />

      <div className="space-y-6 px-5 py-8">
        <Card>
          <LibraryUpload />
        </Card>

        {images.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">
              No images yet. Upload one above, then attach it to any menu item
              from the item editor&rsquo;s photo box.
            </p>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {images.map((image) => (
                <div
                  key={image.id}
                  className="group relative aspect-square overflow-hidden rounded-card border border-line bg-sand shadow-card"
                >
                  {/* Owner-supplied URL; next/image would need remote config. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                  <form
                    action={deleteLibraryImage}
                    className="absolute right-1.5 top-1.5 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100"
                  >
                    <input type="hidden" name="id" value={image.id} />
                    <button
                      type="submit"
                      aria-label="Delete image"
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-ink/70 text-sm text-white transition hover:bg-ink"
                    >
                      ✕
                    </button>
                  </form>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted">
              Deleting an image removes it from any items currently using it.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
