"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/app/_components/button";

import {
  removeItemPhoto,
  uploadItemPhoto,
  type MenuActionState,
} from "./actions";

/**
 * Owner-side photo control for a single (already-saved) menu item, laid out so
 * the uploader sits exactly where the image goes: the current photo fills an
 * image-shaped box (with Replace + Remove), or an empty dashed "Upload photo"
 * box occupies that same spot when there's none.
 *
 * The upload is a SEPARATE multipart form (its own server action), so this must
 * be rendered as a sibling of the ItemForm <form>, never nested inside it. Only
 * available on saved items — a brand-new item has no id yet, exactly like
 * variants/modifiers. Client checks here are a courtesy; uploadItemPhoto
 * re-validates type + size + ownership server-side as the real gate. image_url
 * is written ONLY by uploadItemPhoto/removeItemPhoto — this is layout, not a new
 * upload mechanism.
 */

const ACCEPT = "image/jpeg,image/png,image/webp";
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

const initialState: MenuActionState = {};

export function PhotoControl({
  item,
}: {
  item: { id: string; name: string; imageUrl: string | null };
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-ink">Photo</p>

      {item.imageUrl ? (
        <div className="space-y-3">
          {/* key remounts the uploader (clearing the picked file + any error)
              once a successful upload changes imageUrl. The current photo is the
              clickable image area now — "REPLACE" overlays it on hover/focus. */}
          <UploadForm
            key={item.imageUrl}
            itemId={item.id}
            label="Replace photo"
            imageUrl={item.imageUrl}
            alt={item.name}
          />
          <p className="text-xs text-muted">
            Shown to diners at about this size.
          </p>
          <form action={removeItemPhoto}>
            <input type="hidden" name="id" value={item.id} />
            <RemoveButton />
          </form>
        </div>
      ) : (
        <UploadForm key="none" itemId={item.id} label="Upload photo" empty />
      )}
    </div>
  );
}

function RemoveButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="secondary"
      size="sm"
      loading={pending}
      loadingLabel="Removing…"
    >
      Remove photo
    </Button>
  );
}

function UploadForm({
  itemId,
  label,
  empty,
  imageUrl,
  alt,
}: {
  itemId: string;
  label: string;
  empty?: boolean;
  /** When set, the current photo IS the file picker — "REPLACE" overlays it. */
  imageUrl?: string;
  alt?: string;
}) {
  const [state, formAction, pending] = useActionState(
    uploadItemPhoto,
    initialState,
  );
  const [clientError, setClientError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const hasFile = fileName !== null;

  function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    setClientError(null);
    const file = event.target.files?.[0];
    if (!file) {
      setFileName(null);
      return;
    }
    if (!ALLOWED.includes(file.type)) {
      setClientError("Photo must be a JPEG, PNG, or WebP image.");
      setFileName(null);
      return;
    }
    if (file.size > MAX_BYTES) {
      setClientError("Photo must be 5MB or smaller.");
      setFileName(null);
      return;
    }
    setFileName(file.name);
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="itemId" value={itemId} />

      {imageUrl ? (
        // Replace mode: the current photo IS the file picker. A "REPLACE"
        // overlay appears on hover/focus; picking a file enables the submit
        // button below (the two-step upload + name="photo" contract is unchanged).
        <div className="space-y-1.5">
          <label className="group relative block h-28 w-28 cursor-pointer overflow-hidden rounded-xl border border-line bg-sand">
            {/* Owner-supplied URL; next/image would need remote config. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={alt ?? ""}
              className="h-full w-full object-cover"
            />
            <span className="absolute inset-0 flex items-center justify-center bg-ink/50 text-xs font-bold uppercase tracking-wide text-white opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
              {hasFile ? "Selected" : "Replace"}
            </span>
            <input
              type="file"
              name="photo"
              accept={ACCEPT}
              disabled={pending}
              onChange={handleFile}
              className="sr-only"
            />
          </label>
          {hasFile ? (
            <p className="max-w-28 truncate text-[11px] text-muted">{fileName}</p>
          ) : null}
        </div>
      ) : empty ? (
        // The empty state IS the image area: a small square dropzone matching
        // the size/shape a diner sees on the item card. The format hint moves
        // below the box so the square stays compact.
        <div className="space-y-1.5">
          <label className="flex h-28 w-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line bg-sand px-2 text-center transition hover:border-muted hover:bg-sand/70">
            <span className="max-w-full truncate text-xs font-medium text-ink">
              {hasFile ? fileName : "Upload photo"}
            </span>
            {hasFile ? (
              <span className="text-[11px] text-muted">
                Click Upload to save
              </span>
            ) : null}
            <input
              type="file"
              name="photo"
              accept={ACCEPT}
              disabled={pending}
              onChange={handleFile}
              className="sr-only"
            />
          </label>
          <p className="text-xs text-muted">
            Shown to diners at about this size. JPEG, PNG, or WebP · up to 5MB.
          </p>
        </div>
      ) : (
        <input
          type="file"
          name="photo"
          accept={ACCEPT}
          disabled={pending}
          onChange={handleFile}
          className="block w-full text-sm text-ink file:mr-3 file:rounded-control file:border file:border-line file:bg-surface-elevated file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink hover:file:bg-sand disabled:opacity-50"
        />
      )}

      {clientError ? (
        <p className="text-sm text-[var(--color-warm)]" role="alert">
          {clientError}
        </p>
      ) : null}
      {state.error ? (
        <p className="text-sm text-[var(--color-warm)]" role="alert">
          {state.error}
        </p>
      ) : null}

      <Button
        type="submit"
        variant="primary"
        disabled={!hasFile}
        loading={pending}
        loadingLabel="Uploading…"
      >
        {label}
      </Button>
      {!empty ? (
        <p className="text-xs text-muted">JPEG, PNG, or WebP · up to 5MB.</p>
      ) : null}
    </form>
  );
}
