"use client";

import { useActionState } from "react";

import { Button } from "@/app/_components/button";
import { Input } from "@/app/_components/input";

import { updateSocialLinks, type VenueSettingsState } from "./actions";

const initialState: VenueSettingsState = {};

const microLabel =
  "mb-1 block font-mono text-[9px] font-bold uppercase tracking-wider text-label";

/**
 * Social profile links shown as "Follow us" icons in the storefront footer.
 * v1 carries Instagram; the other platforms follow in a later change (each is a
 * nullable column with the same normalise-empty-to-null rule).
 */
export function SocialLinksForm({
  instagramUrl,
}: {
  instagramUrl: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    updateSocialLinks,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-3">
      <label className="block">
        <span className={microLabel}>
          Instagram{" "}
          <span className="font-normal normal-case text-muted">(optional)</span>
        </span>
        <Input
          name="instagramUrl"
          maxLength={200}
          defaultValue={instagramUrl ?? ""}
          placeholder="@yourvenue or instagram.com/yourvenue"
        />
      </label>
      <p className="text-xs text-muted">
        Adds a &ldquo;Follow us&rdquo; link to your storefront footer.
      </p>

      {state.error ? (
        <p className="text-sm text-[var(--color-warm)]" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-[var(--color-success)]" role="status">
          Saved.
        </p>
      ) : null}

      <Button type="submit" variant="primary" loading={pending} loadingLabel="Saving…">
        Save <span aria-hidden="true">→</span>
      </Button>
    </form>
  );
}
