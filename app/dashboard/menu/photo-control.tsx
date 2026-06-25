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
 * Owner-side photo control for a single (already-saved) menu item. Shows the
 * current photo with Replace + Remove, or an Add-photo uploader when none.
 *
 * The upload is a SEPARATE multipart form (its own server action), so this must
 * be rendered as a sibling of the ItemForm <form>, never nested inside it. Only
 * available on saved items — a brand-new item has no id yet, exactly like
 * variants/modifiers. Client checks here are a courtesy; uploadItemPhoto
 * re-validates type + size + ownership server-side as the real gate.
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
    <div className="space-y-3">
      <p className="text-sm font-medium text-gray-900">Photo</p>

      {item.imageUrl ? (
        <div className="flex items-start gap-3">
          {/* Owner-supplied URL; next/image would need remote config. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.imageUrl}
            alt={item.name}
            className="h-20 w-20 shrink-0 rounded-lg border border-gray-200 object-cover"
          />
          <form action={removeItemPhoto}>
            <input type="hidden" name="id" value={item.id} />
            <RemoveButton />
          </form>
        </div>
      ) : (
        <p className="text-xs text-gray-500">
          No photo yet. Customers see a clean text-only row until you add one.
        </p>
      )}

      {/* key remounts the uploader (clearing the picked file + any error) once a
          successful upload changes imageUrl. */}
      <UploadForm
        key={item.imageUrl ?? "none"}
        itemId={item.id}
        label={item.imageUrl ? "Replace photo" : "Add photo"}
      />
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
      {pending ? <Spinner size="sm" label="Removing photo" /> : "Remove"}
    </button>
  );
}

function UploadForm({ itemId, label }: { itemId: string; label: string }) {
  const [state, formAction, pending] = useActionState(
    uploadItemPhoto,
    initialState,
  );
  const [clientError, setClientError] = useState<string | null>(null);
  const [hasFile, setHasFile] = useState(false);

  function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    setClientError(null);
    const file = event.target.files?.[0];
    if (!file) {
      setHasFile(false);
      return;
    }
    if (!ALLOWED.includes(file.type)) {
      setClientError("Photo must be a JPEG, PNG, or WebP image.");
      setHasFile(false);
      return;
    }
    if (file.size > MAX_BYTES) {
      setClientError("Photo must be 5MB or smaller.");
      setHasFile(false);
      return;
    }
    setHasFile(true);
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="itemId" value={itemId} />
      <input
        type="file"
        name="photo"
        accept={ACCEPT}
        disabled={pending}
        onChange={handleFile}
        className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border file:border-gray-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-50 disabled:opacity-50"
      />

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
      <p className="text-xs text-gray-400">JPEG, PNG, or WebP · up to 5MB.</p>
    </form>
  );
}
