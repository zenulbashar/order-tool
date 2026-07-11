"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/app/_components/button";
import { Input } from "@/app/_components/input";

import {
  type LogoState,
  removeVenueBackground,
  removeVenueCover,
  removeVenueCover2,
  removeVenueCover3,
  setVenueBackgroundUrl,
  setVenueCover2Url,
  setVenueCover3Url,
  setVenueCoverUrl,
  uploadVenueBackground,
  uploadVenueCover,
  uploadVenueCover2,
  uploadVenueCover3,
} from "./actions";

/**
 * Owner-side control for one storefront brand image (the cover band or the
 * gutter background). Modelled on LogoControl: the image is uploaded server-side
 * to R2 OR pasted as a hosted URL — either way the venue column is owned by the
 * dedicated slot actions in ./actions, so the theme "Save" can't clobber it.
 * Client checks (type/size) are a courtesy; the actions re-validate server-side
 * as the real gate. Preview is object-cover (these are photos, unlike the logo's
 * contained mark), reflecting exactly how the storefront crops them.
 */

const ACCEPT = "image/jpeg,image/png,image/webp";
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

const microLabel =
  "mb-1 block font-mono text-[9px] font-bold uppercase tracking-wider text-label";
const initialState: LogoState = {};

type Slot = "cover" | "cover2" | "cover3" | "background";

const ACTIONS = {
  cover: {
    upload: uploadVenueCover,
    setUrl: setVenueCoverUrl,
    remove: removeVenueCover,
  },
  cover2: {
    upload: uploadVenueCover2,
    setUrl: setVenueCover2Url,
    remove: removeVenueCover2,
  },
  cover3: {
    upload: uploadVenueCover3,
    setUrl: setVenueCover3Url,
    remove: removeVenueCover3,
  },
  background: {
    upload: uploadVenueBackground,
    setUrl: setVenueBackgroundUrl,
    remove: removeVenueBackground,
  },
} as const;

export function ImageryControl({
  slot,
  title,
  description,
  imageUrl,
}: {
  slot: Slot;
  title: string;
  description: string;
  imageUrl: string | null;
}) {
  const actions = ACTIONS[slot];
  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-display text-sm font-semibold tracking-tight text-ink">
          {title}
        </h3>
        <p className="mt-0.5 text-xs text-muted">{description}</p>
      </div>

      {imageUrl ? (
        <div className="flex flex-wrap items-end gap-4">
          {/* key remounts the uploader (clearing the picked file + any error)
              once a successful upload/URL change swaps the stored URL. */}
          <UploadForm
            key={imageUrl}
            slot={slot}
            label="Replace image"
            imageUrl={imageUrl}
          />
          <form action={actions.remove}>
            <RemoveButton />
          </form>
        </div>
      ) : (
        <UploadForm key="none" slot={slot} label="Upload image" empty />
      )}

      <PasteUrlForm slot={slot} imageUrl={imageUrl} />
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
      Remove
    </Button>
  );
}

function UploadForm({
  slot,
  label,
  empty,
  imageUrl,
}: {
  slot: Slot;
  label: string;
  empty?: boolean;
  /** When set, the current image IS the file picker — "REPLACE" overlays it. */
  imageUrl?: string;
}) {
  const [state, formAction, pending] = useActionState(
    ACTIONS[slot].upload,
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
      setClientError("Image must be a JPEG, PNG, or WebP image.");
      setFileName(null);
      return;
    }
    if (file.size > MAX_BYTES) {
      setClientError("Image must be 5MB or smaller.");
      setFileName(null);
      return;
    }
    setFileName(file.name);
  }

  // Landscape preview: these images crop object-cover on the storefront, so a
  // wide box previews them the way a diner will actually see them.
  const box = "h-24 w-40 rounded-xl";

  return (
    <form action={formAction} className="space-y-2">
      {imageUrl ? (
        <div className="space-y-1.5">
          <label
            className={`group relative block ${box} cursor-pointer overflow-hidden border border-line bg-sand`}
          >
            {/* Owner-supplied URL; next/image would need remote config. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt="Current image"
              className="h-full w-full object-cover"
            />
            <span className="absolute inset-0 flex items-center justify-center bg-ink/50 text-xs font-bold uppercase tracking-wide text-white opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
              {hasFile ? "Selected" : "Replace"}
            </span>
            <input
              type="file"
              name="image"
              accept={ACCEPT}
              disabled={pending}
              onChange={handleFile}
              className="sr-only"
            />
          </label>
          {hasFile ? (
            <p className="max-w-40 truncate text-[11px] text-muted">{fileName}</p>
          ) : null}
        </div>
      ) : empty ? (
        <div className="space-y-1.5">
          <label
            className={`flex ${box} cursor-pointer flex-col items-center justify-center gap-1 border-2 border-dashed border-line bg-sand px-2 text-center transition hover:border-muted hover:bg-sand/70`}
          >
            <span className="max-w-full truncate text-xs font-medium text-ink">
              {hasFile ? fileName : "Upload image"}
            </span>
            {hasFile ? (
              <span className="text-[11px] text-muted">Click Upload to save</span>
            ) : null}
            <input
              type="file"
              name="image"
              accept={ACCEPT}
              disabled={pending}
              onChange={handleFile}
              className="sr-only"
            />
          </label>
        </div>
      ) : null}

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
        size="sm"
        disabled={!hasFile}
        loading={pending}
        loadingLabel="Uploading…"
      >
        {label}
      </Button>
    </form>
  );
}

/** Alternative to uploading: paste a hosted image URL (the pre-upload path). */
function PasteUrlForm({
  slot,
  imageUrl,
}: {
  slot: Slot;
  imageUrl: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    ACTIONS[slot].setUrl,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-1.5 border-t border-line pt-3">
      <label className="block">
        <span className={microLabel}>Or paste a hosted image URL</span>
        <Input
          name="imageUrl"
          type="url"
          maxLength={2048}
          defaultValue={imageUrl ?? ""}
          placeholder="https://…/image.jpg"
        />
      </label>
      {state.error ? (
        <p className="text-sm text-[var(--color-warm)]" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        loading={pending}
        loadingLabel="Saving…"
      >
        Save URL
      </Button>
    </form>
  );
}
