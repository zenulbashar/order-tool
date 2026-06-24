"use client";

import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import Link from "next/link";
import { useMemo, useState } from "react";

import { formatCents } from "@/lib/validation";

import type { PublicVenue } from "../types";

/**
 * Stripe payment step for a DIRECT CHARGE on the venue's connected account.
 * Stripe.js MUST be loaded with { stripeAccount } so the Payment Element and
 * confirmation target the connected account's PaymentIntent. The order is
 * already created server-side as 'pending_payment'; it is confirmed ONLY by the
 * webhook — never by this client.
 */
export function PaymentStep({
  venue,
  clientSecret,
  stripeAccountId,
  publishableKey,
  token,
  amountCents,
}: {
  venue: PublicVenue;
  clientSecret: string;
  stripeAccountId: string;
  publishableKey: string;
  token: string;
  amountCents: number;
}) {
  const stripePromise = useMemo(
    () => loadStripe(publishableKey, { stripeAccount: stripeAccountId }),
    [publishableKey, stripeAccountId],
  );

  const brandStyle = { "--brand": venue.brandColor } as React.CSSProperties;

  return (
    <main style={brandStyle} className="mx-auto min-h-dvh max-w-2xl bg-white">
      <header className="border-b border-gray-100 px-5 py-5">
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">
          Payment
        </h1>
        <p className="text-sm text-gray-500">{venue.name}</p>
      </header>

      <Elements
        stripe={stripePromise}
        options={{
          clientSecret,
          appearance: { variables: { colorPrimary: venue.brandColor } },
        }}
      >
        <PaymentForm venue={venue} token={token} amountCents={amountCents} />
      </Elements>
    </main>
  );
}

function PaymentForm({
  venue,
  token,
  amountCents,
}: {
  venue: PublicVenue;
  token: string;
  amountCents: number;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handlePay(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stripe || !elements || submitting) return;
    setSubmitting(true);
    setError(null);

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        // After payment Stripe redirects here; the order page reflects the live
        // status (processing → paid via the webhook, or failed).
        return_url: `${window.location.origin}/${venue.slug}/order/${token}`,
      },
    });

    // We only reach this point when confirmation did NOT redirect — i.e. an
    // immediate error (declined card, validation). Keep the customer on this
    // step with a clear, non-alarming message so they can retry. On success,
    // Stripe has already redirected to return_url.
    if (confirmError) {
      setError(
        confirmError.message ??
          "We couldn't process that payment. Please check your details and try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handlePay} className="space-y-5 px-5 py-6">
      <PaymentElement />

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={!stripe || submitting}
        className="w-full rounded-lg px-4 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
        style={{ backgroundColor: "var(--brand)" }}
      >
        {submitting ? "Processing…" : `Pay $${formatCents(amountCents)}`}
      </button>

      <p className="text-center text-xs text-gray-400">
        Payments are securely processed by Stripe.
      </p>
      <Link
        href={`/${venue.slug}`}
        className="block text-center text-xs text-gray-500 underline hover:text-gray-700"
      >
        Cancel and return to {venue.name}
      </Link>
    </form>
  );
}
