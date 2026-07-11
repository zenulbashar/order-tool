"use client";

import { useActionState } from "react";

import { Button } from "@/app/_components/button";
import { Field } from "@/app/_components/field";
import { Input } from "@/app/_components/input";

import { type DetailsResult, updateCustomerDetails } from "../actions";

const initial: DetailsResult = {};

/**
 * Edit the customer's optional profile (name + phone). Email is the verified
 * sign-in identity and is shown read-only. Ownership is enforced server-side by
 * updateCustomerDetails (session-derived customer); this is just the form.
 */
export function AccountDetailsForm({
  slug,
  email,
  name,
  phone,
}: {
  slug: string;
  email: string;
  name: string | null;
  phone: string | null;
}) {
  const [state, action, pending] = useActionState(
    updateCustomerDetails,
    initial,
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />

      <Field label="Email" htmlFor="account-email">
        <Input id="account-email" value={email} readOnly disabled />
      </Field>
      <p className="-mt-2 text-xs text-muted">
        Your sign-in address — used for receipts. It can&rsquo;t be changed here.
      </p>

      <Field label="Name" htmlFor="account-name">
        <Input
          id="account-name"
          name="name"
          defaultValue={name ?? ""}
          maxLength={80}
          autoComplete="name"
          placeholder="e.g. Alex Rivera"
        />
      </Field>

      <Field
        label={
          <>
            Phone <span className="font-normal text-muted">(optional)</span>
          </>
        }
        htmlFor="account-phone"
      >
        <Input
          id="account-phone"
          name="phone"
          type="tel"
          defaultValue={phone ?? ""}
          maxLength={30}
          autoComplete="tel"
          placeholder="e.g. 0400 000 000"
        />
      </Field>

      {state.error ? (
        <p className="text-sm text-[var(--color-warm)]" role="alert">
          {state.error}
        </p>
      ) : state.success ? (
        <p className="text-sm text-success-deep" role="status">
          Saved.
        </p>
      ) : null}

      <Button
        type="submit"
        variant="primary"
        loading={pending}
        loadingLabel="Saving…"
      >
        Save details
      </Button>
    </form>
  );
}
