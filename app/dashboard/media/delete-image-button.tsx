"use client";

/**
 * Delete affordance for a library image — a small ✕ overlaid on the thumbnail.
 * Kept as an icon button (not the destructive <Button>) so it fits the image
 * overlay, but gated by a confirm because the delete FK-cascades a detach from
 * every menu item using the image (see MediaPage). Submits the enclosing
 * <form action={deleteLibraryImage}> only after the owner confirms.
 */
export function DeleteImageButton() {
  return (
    <button
      type="submit"
      aria-label="Delete image"
      onClick={(event) => {
        if (
          !window.confirm(
            "Delete this image? It will be removed from any items currently using it.",
          )
        ) {
          event.preventDefault();
        }
      }}
      className="flex h-7 w-7 items-center justify-center rounded-full bg-ink/70 text-sm text-white transition hover:bg-ink"
    >
      ✕
    </button>
  );
}
