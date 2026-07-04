"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/app/_components/button";
import { Input } from "@/app/_components/input";

import {
  type LogoState,
  removeVenueLogo,
  setVenueLogoUrl,
  uploadVenueLogo,
} from "./actions";

/**
 * Owner-side logo control. The logo is uploaded server-side to R2 (never
 * browser->R2) OR pasted as a hosted URL — either way the venue's logo_url is
 * owned by the dedicated actions in ./actions, so the main theme "Save" can't
 * clobber it. Client checks (type/size) are a courtesy; uploadVenueLogo
 * re-validates server-side as the real gate. The logo shows on the storefront
 * and in the Design studio (menus + banners).
 */

const ACCEPT = "image/jpeg,image/png,image/webp";
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 2 * 1024 * 1024; // 2MB

const microLabel =
  "mb-1 block font-mono text-[9px] font-bold uppercase tracking-wider text-label";
const initialState: LogoState = {};

export function LogoControl({ logoUrl }: { logoUrl: string | null }) {
  return (
    <div className="space-y-3">
      <span className={microLabel}>
        Logo{" "}
        <span className="font-normal normal-case text-muted">(optional)</span>
      </span>

      {logoUrl ? (
        <div className="space-y-3">
          {/* key remounts the uploader (clearing the picked file + any error)
              once a successful upload/URL change swaps logo_url. */}
          <UploadForm key={logoUrl} label="Replace logo" logoUrl={logoUrl} />
          <form action={removeVenueLogo}>
            <RemoveButton />
          </form>
        </div>
      ) : (
        <UploadForm key="none" label="Upload logo" empty />
      )}

      <PasteUrlForm logoUrl={logoUrl} />

      <p className="text-xs text-muted">
        JPEG, PNG, or WebP · up to 2MB. Transparent PNGs work best. Shown on your
        storefront and in the Design studio.
      </p>
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
      Remove logo
    </Button>
  );
}

function UploadForm({
  label,
  empty,
  logoUrl,
}: {
  label: string;
  empty?: boolean;
  /** When set, the current logo IS the file picker — "REPLACE" overlays it. */
  logoUrl?: string;
}) {
  const [state, formAction, pending] = useActionState(
    uploadVenueLogo,
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
      setClientError("Logo must be a JPEG, PNG, or WebP image.");
      setFileName(null);
      return;
    }
    if (file.size > MAX_BYTES) {
      setClientError("Logo must be 2MB or smaller.");
      setFileName(null);
      return;
    }
    setFileName(file.name);
  }

  return (
    <form action={formAction} className="space-y-2">
      {logoUrl ? (
        <div className="space-y-1.5">
          <label className="group relative block h-28 w-28 cursor-pointer overflow-hidden rounded-xl border border-line bg-[repeating-conic-gradient(#f0ece1_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]">
            {/* Owner-supplied URL; next/image would need remote config. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoUrl}
              alt="Current logo"
              className="h-full w-full object-contain p-2"
            />
            <span className="absolute inset-0 flex items-center justify-center bg-ink/50 text-xs font-bold uppercase tracking-wide text-white opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
              {hasFile ? "Selected" : "Replace"}
            </span>
            <input
              type="file"
              name="logo"
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
        <div className="space-y-1.5">
          <label className="flex h-28 w-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line bg-sand px-2 text-center transition hover:border-muted hover:bg-sand/70">
            <span className="max-w-full truncate text-xs font-medium text-ink">
              {hasFile ? fileName : "Upload logo"}
            </span>
            {hasFile ? (
              <span className="text-[11px] text-muted">Click Upload to save</span>
            ) : null}
            <input
              type="file"
              name="logo"
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
function PasteUrlForm({ logoUrl }: { logoUrl: string | null }) {
  const [state, formAction, pending] = useActionState(
    setVenueLogoUrl,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-1.5 border-t border-line pt-3">
      <label className="block">
        <span className={microLabel}>Or paste a hosted image URL</span>
        <Input
          name="logoUrl"
          type="url"
          maxLength={2048}
          defaultValue={logoUrl ?? ""}
          placeholder="https://…/logo.png"
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
