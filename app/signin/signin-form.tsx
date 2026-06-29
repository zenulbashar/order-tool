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
export function SignInForm() {
  const [state, formAction, pending] = useActionState(requestOwnerSignIn, {
    error: null,
  });

  return (
    <form action={formAction} className="space-y-4">
      <input
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="you@example.com"
        className="w-full rounded-lg border border-sand bg-surface-elevated px-3 py-2.5 text-sm text-ink shadow-sm placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />

      {state.error ? (
        <p className="text-sm text-error" role="alert">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-brand hover:text-surface disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ButtonLabel pending={pending} pendingLabel="Sending link…">
          Send magic link
        </ButtonLabel>
      </button>
    </form>
  );
}
