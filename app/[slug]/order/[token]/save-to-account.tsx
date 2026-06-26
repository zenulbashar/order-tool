"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { ButtonLabel } from "@/app/_components/spinner";

import { claimOrder } from "../../account/actions";

/**
 * "Save this order to your account" on the confirmation page (#7). Shown only to
 * a signed-in customer. Claiming is IDOR-safe server-side: possession of this
 * order's opaque token is the proof, and the action only links it if it's still
 * unclaimed. Opt-in — the order works identically whether or not it's saved.
 */
export function SaveToAccount({ slug, token }: { slug: string; token: string }) {
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await claimOrder(slug, token);
      if (result.ok) {
        setSaved(true);
      } else {
        setError(result.error);
      }
    });
  }

  if (saved) {
    return (
      <p className="text-sm text-gray-600">
        Saved to your account.{" "}
        <Link
          href={`/${slug}/account`}
          className="font-medium underline"
          style={{ color: "var(--brand)" }}
        >
          View your orders
        </Link>
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleSave}
        disabled={pending}
        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-900 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ButtonLabel pending={pending} pendingLabel="Saving…">
          Save this order to your account
        </ButtonLabel>
      </button>
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
