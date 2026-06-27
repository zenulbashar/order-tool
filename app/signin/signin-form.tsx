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
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
      />

      {state.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ButtonLabel pending={pending} pendingLabel="Sending link…">
          Send magic link
        </ButtonLabel>
      </button>
    </form>
  );
}
