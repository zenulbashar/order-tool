"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Spinner } from "@/app/_components/spinner";

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
      <p className="text-sm font-medium text-gray-900">Photo</p>

      {item.imageUrl ? (
        <div className="space-y-3">
          {/* Square preview at the size a diner actually sees on the item card
              (object-cover, rounded-xl) so the owner gets a realistic preview,
              not a giant upload rectangle. */}
          <div className="h-28 w-28 overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
            {/* Owner-supplied URL; next/image would need remote config. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.imageUrl}
              alt={item.name}
              className="h-full w-full object-cover"
            />
          </div>
          <p className="text-xs text-gray-400">
            Shown to diners at about this size.
          </p>
          {/* key remounts the uploader (clearing the picked file + any error)
              once a successful upload changes imageUrl. */}
          <UploadForm
            key={item.imageUrl}
            itemId={item.id}
            label="Replace photo"
          />
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
    <button
      type="submit"
      disabled={pending}
      className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
    >
      {pending ? <Spinner size="sm" label="Removing photo" /> : "Remove photo"}
    </button>
  );
}

function UploadForm({
  itemId,
  label,
  empty,
}: {
  itemId: string;
  label: string;
  empty?: boolean;
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

      {empty ? (
        // The empty state IS the image area: a small square dropzone matching
        // the size/shape a diner sees on the item card. The format hint moves
        // below the box so the square stays compact.
        <div className="space-y-1.5">
          <label className="flex h-28 w-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-2 text-center transition hover:border-gray-400 hover:bg-gray-100">
            <span className="max-w-full truncate text-xs font-medium text-gray-700">
              {hasFile ? fileName : "Upload photo"}
            </span>
            {hasFile ? (
              <span className="text-[11px] text-gray-400">
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
          <p className="text-xs text-gray-400">
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
          className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border file:border-gray-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-50 disabled:opacity-50"
        />
      )}

      {clientError ? (
        <p className="text-sm text-red-600" role="alert">
          {clientError}
        </p>
      ) : null}
      {state.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || !hasFile}
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? (
          <span className="inline-flex items-center gap-2">
            <Spinner size="sm" />
            Uploading…
          </span>
        ) : (
          label
        )}
      </button>
      {!empty ? (
        <p className="text-xs text-gray-400">JPEG, PNG, or WebP · up to 5MB.</p>
      ) : null}
    </form>
  );
}
