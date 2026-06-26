"use client";

import { useState, useTransition } from "react";

import { ButtonLabel } from "@/app/_components/spinner";

import { requestCustomerMagicLink } from "./actions";

const fieldClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900";

/**
 * Opt-in customer sign-in: enter an email, receive a magic link. Separate from
 * owner sign-in. On success we show a generic "check your email" — the link is
 * always sent for a valid email, so nothing about an account is disclosed.
 */
export function SignInForm({
  slug,
  venueName,
  linkError,
}: {
  slug: string;
  venueName: string;
  linkError: boolean;
}) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(
    linkError
      ? "That sign-in link was invalid or has expired. Enter your email for a new one."
      : null,
  );
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await requestCustomerMagicLink(slug, email);
      if (result.ok) {
        setSent(true);
      } else {
        setError(result.error);
      }
    });
  }

  if (sent) {
    return (
      <section className="px-5 py-8">
        <div className="rounded-lg border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900">
            Check your email
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            If that address is valid, we&apos;ve sent a sign-in link to{" "}
            <span className="font-medium text-gray-900">{email}</span>. It
            expires in 15 minutes and can be used once.
          </p>
          <button
            type="button"
            onClick={() => setSent(false)}
            className="mt-4 text-sm font-medium underline"
            style={{ color: "var(--brand)" }}
          >
            Use a different email
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="px-5 py-8">
      <p className="text-sm text-gray-600">
        Save your details and view your past orders at {venueName}, then reorder
        in one tap. Ordering never requires an account — this is optional.
      </p>
      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <label className="block text-sm font-medium text-gray-900">
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            maxLength={254}
            required
            autoComplete="email"
            placeholder="you@example.com"
            className={`mt-1 ${fieldClass}`}
          />
        </label>

        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg px-4 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
          style={{ backgroundColor: "var(--brand)" }}
        >
          <ButtonLabel pending={pending} pendingLabel="Sending link…">
            Email me a sign-in link
          </ButtonLabel>
        </button>
      </form>
    </section>
  );
}
