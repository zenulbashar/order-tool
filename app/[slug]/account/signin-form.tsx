"use client";

import { useState, useTransition } from "react";

import { Button } from "@/app/_components/button";
import { Field } from "@/app/_components/field";
import { Input } from "@/app/_components/input";

import { requestCustomerMagicLink } from "./actions";

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
        <div className="rounded-card border border-line p-5">
          <h2 className="text-sm font-semibold text-ink">Check your email</h2>
          <p className="mt-1 text-sm text-muted">
            If that address is valid, we&apos;ve sent a sign-in link to{" "}
            <span className="font-medium text-ink">{email}</span>. It expires in
            15 minutes and can be used once.
          </p>
          <button
            type="button"
            onClick={() => setSent(false)}
            className="mt-4 text-sm font-medium underline"
            style={{ color: "var(--action)" }}
          >
            Use a different email
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="px-5 py-8">
      <p className="text-sm text-muted">
        Save your details and view your past orders at {venueName}, then reorder
        in one tap. Ordering never requires an account — this is optional.
      </p>
      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <Field label="Email" htmlFor="customer-email">
          <Input
            id="customer-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            maxLength={254}
            required
            autoComplete="email"
            placeholder="you@example.com"
          />
        </Field>

        {error ? (
          <p className="text-sm text-[var(--color-warm)]" role="alert">
            {error}
          </p>
        ) : null}

        <Button
          type="submit"
          variant="primary"
          loading={pending}
          loadingLabel="Sending link…"
          className="w-full"
        >
          Email me a sign-in link
        </Button>
      </form>
    </section>
  );
}
