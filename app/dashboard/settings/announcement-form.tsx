"use client";

import { useActionState } from "react";

import { Button } from "@/app/_components/button";
import { Input } from "@/app/_components/input";

import { updateAnnouncement, type VenueSettingsState } from "./actions";

const initialState: VenueSettingsState = {};

const microLabel =
  "mb-1 block font-mono text-[9px] font-bold uppercase tracking-wider text-label";

/** The slim promo bar across the top of the storefront (empty → hidden). */
export function AnnouncementForm({
  announcement,
}: {
  announcement: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    updateAnnouncement,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-3">
      <label className="block">
        <span className={microLabel}>
          Announcement bar{" "}
          <span className="font-normal normal-case text-muted">(optional)</span>
        </span>
        <Input
          name="announcement"
          maxLength={140}
          defaultValue={announcement ?? ""}
          placeholder="e.g. Order your cake online — pick up in store"
        />
      </label>
      <p className="text-xs text-muted">
        A slim promo bar shown across the top of your storefront. Leave blank to
        hide it.
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
