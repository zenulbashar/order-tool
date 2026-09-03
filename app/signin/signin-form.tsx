"use client";

import { useActionState } from "react";

import { ButtonLabel } from "@/app/_components/spinner";

import { requestOwnerSignIn } from "./actions";

/**
 * Owner magic-link sign-in form. Extracted to a client component so a rate-limit
 * rejection from requestOwnerSignIn can surface in an error slot (the previous
 * inline server-action form had none). On success the action redirects exactly
 * as before.
 */
export function SignInForm({
  initialEmail = "",
  returnTo = "/",
}: {
  initialEmail?: string;
  /** Same-origin path to land on after the magic link is used. */
  returnTo?: string;
}) {
  const [state, formAction, pending] = useActionState(requestOwnerSignIn, {
    error: null,
  });

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="callbackUrl" value={returnTo} />
      <input
        name="email"
        type="email"
        required
        autoComplete="email"
        // defaultValue, not value: the field stays uncontrolled so the visitor
        // can edit it, and a re-render after a rate-limit error does not wipe
        // what they typed.
        defaultValue={initialEmail}
        placeholder="you@example.com"
        className="w-full rounded-lg border border-sand bg-surface-elevated px-3 py-2.5 text-base sm:text-sm text-ink shadow-sm placeholder:text-muted focus-visible:border-[var(--color-accent)] focus-visible:shadow-[var(--focus-ring-input)] focus-visible:outline-none"
      />

      {state.error ? (
        <p className="text-sm text-error" role="alert">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-forest hover:text-surface disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ButtonLabel pending={pending} pendingLabel="Sending link…">
          Send magic link
        </ButtonLabel>
      </button>
    </form>
  );
}
