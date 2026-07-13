"use client";

import { useActionState } from "react";

import { Button } from "@/app/_components/button";
import { Input } from "@/app/_components/input";

import { updateSocialLinks, type VenueSettingsState } from "./actions";

const initialState: VenueSettingsState = {};

const microLabel =
  "mb-1 block font-mono text-[9px] font-bold uppercase tracking-wider text-label";

export type SocialLinks = {
  instagramUrl: string | null;
  facebookUrl: string | null;
  xUrl: string | null;
  youtubeUrl: string | null;
  tiktokUrl: string | null;
  linkedinUrl: string | null;
  websiteUrl: string | null;
};

// Each field: the form input name (matches the server action), a label, and a
// placeholder that shows both the handle and the URL shape a layman can copy.
const FIELDS: {
  name: keyof SocialLinks;
  label: string;
  placeholder: string;
}[] = [
  { name: "instagramUrl", label: "Instagram", placeholder: "@yourvenue or instagram.com/yourvenue" },
  { name: "facebookUrl", label: "Facebook", placeholder: "yourvenue or facebook.com/yourvenue" },
  { name: "xUrl", label: "X (Twitter)", placeholder: "@yourvenue or x.com/yourvenue" },
  { name: "youtubeUrl", label: "YouTube", placeholder: "@yourvenue or youtube.com/@yourvenue" },
  { name: "tiktokUrl", label: "TikTok", placeholder: "@yourvenue or tiktok.com/@yourvenue" },
  { name: "linkedinUrl", label: "LinkedIn", placeholder: "yourvenue or linkedin.com/company/yourvenue" },
  { name: "websiteUrl", label: "Website", placeholder: "yourvenue.com" },
];

/**
 * Social profile links shown as "Follow us" icons in the storefront footer. Each
 * platform is its own nullable column; the owner fills in any subset and blanks
 * are stored as null (never fabricated). A bare handle is normalised to the
 * platform's canonical URL server-side, so the footer links are always safe.
 */
export function SocialLinksForm({ links }: { links: SocialLinks }) {
  const [state, formAction, pending] = useActionState(
    updateSocialLinks,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      {FIELDS.map((field) => (
        <label key={field.name} className="block">
          <span className={microLabel}>
            {field.label}{" "}
            <span className="font-normal normal-case text-muted">(optional)</span>
          </span>
          <Input
            name={field.name}
            maxLength={200}
            defaultValue={links[field.name] ?? ""}
            placeholder={field.placeholder}
          />
        </label>
      ))}

      <p className="text-xs text-muted">
        Each link you add shows as a &ldquo;Follow us&rdquo; icon in your
        storefront footer. Leave a field blank to hide it.
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
