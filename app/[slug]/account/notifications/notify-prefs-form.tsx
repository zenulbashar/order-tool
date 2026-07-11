"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/app/_components/button";

import { type DetailsResult, updateNotificationPrefs } from "../actions";

const initial: DetailsResult = {};

/**
 * Order-notification opt-ins (email + SMS). Persists to the customer via
 * updateNotificationPrefs (session-scoped). SMS also needs a phone number — when
 * there isn't one, we still let the toggle save but point the customer to Your
 * details, and note that SMS also depends on the venue having it enabled.
 */
export function NotifyPrefsForm({
  slug,
  email,
  phone,
  notifyOrderEmail,
  notifyOrderSms,
}: {
  slug: string;
  email: string;
  phone: string | null;
  notifyOrderEmail: boolean;
  notifyOrderSms: boolean;
}) {
  const [state, action, pending] = useActionState(
    updateNotificationPrefs,
    initial,
  );

  return (
    <form action={action} className="max-w-md space-y-3">
      <input type="hidden" name="slug" value={slug} />

      <label className="flex items-start gap-3 rounded-card border border-line bg-surface-elevated p-4">
        <input
          type="checkbox"
          name="notifyOrderEmail"
          defaultChecked={notifyOrderEmail}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--action)]"
        />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-ink">Email</span>
          <span className="block text-xs text-muted">
            Order confirmed &amp; ready updates, sent to{" "}
            <span className="font-medium text-ink">{email}</span>.
          </span>
        </span>
      </label>

      <label className="flex items-start gap-3 rounded-card border border-line bg-surface-elevated p-4">
        <input
          type="checkbox"
          name="notifyOrderSms"
          defaultChecked={notifyOrderSms}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--action)]"
        />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-ink">Text (SMS)</span>
          <span className="block text-xs text-muted">
            {phone ? (
              <>
                Sent to <span className="font-medium text-ink">{phone}</span>.
              </>
            ) : (
              <>
                Add a phone number in{" "}
                <Link
                  href={`/${slug}/account/details`}
                  className="font-medium underline"
                >
                  Your details
                </Link>{" "}
                to receive texts.
              </>
            )}
          </span>
        </span>
      </label>

      {state.error ? (
        <p className="text-sm text-[var(--color-warm)]" role="alert">
          {state.error}
        </p>
      ) : state.success ? (
        <p className="text-sm text-success-deep" role="status">
          Preferences saved.
        </p>
      ) : null}

      <Button
        type="submit"
        variant="primary"
        loading={pending}
        loadingLabel="Saving…"
      >
        Save preferences
      </Button>
    </form>
  );
}
