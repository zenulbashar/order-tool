"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { Button } from "@/app/_components/button";

import { uploadLibraryImage, type MediaState } from "./actions";

const ACCEPT = "image/jpeg,image/png,image/webp";
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;
const initialState: MediaState = {};

export function LibraryUpload() {
  const [state, formAction, pending] = useActionState(
    uploadLibraryImage,
    initialState,
  );
  const [clientError, setClientError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  // Clear the picker after a successful upload (the grid re-renders with it).
  useEffect(() => {
    if (wasPending.current && !pending && !state.error) {
      formRef.current?.reset();
      setFileName(null);
    }
    wasPending.current = pending;
  }, [pending, state]);

  function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    setClientError(null);
    const file = event.target.files?.[0];
    if (!file) return setFileName(null);
    if (!ALLOWED.includes(file.type)) {
      setClientError("Image must be a JPEG, PNG, or WebP.");
      return setFileName(null);
    }
    if (file.size > MAX_BYTES) {
      setClientError("Image must be 5MB or smaller.");
      return setFileName(null);
    }
    setFileName(file.name);
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <input
        type="file"
        name="image"
        accept={ACCEPT}
        disabled={pending}
        onChange={handleFile}
        className="block w-full text-sm text-ink file:mr-3 file:rounded-control file:border file:border-line file:bg-surface-elevated file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink hover:file:bg-sand disabled:opacity-50"
      />
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
        disabled={fileName === null}
        loading={pending}
        loadingLabel="Uploading…"
      >
        Upload to library
      </Button>
      <p className="text-xs text-muted">JPEG, PNG, or WebP · up to 5MB.</p>
    </form>
  );
}
