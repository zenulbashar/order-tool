"use client";

import {
  Elements,
  ExpressCheckoutElement,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import { readableOn } from "@/app/_components/brand-contrast";
import { Button } from "@/app/_components/button";
import { bankDiscountCents } from "@/lib/payments/bank-discount";
import { formatCents } from "@/lib/validation";

import { applyBankDiscount } from "./discount-actions";

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

  const brandStyle = {
    "--brand": venue.brandColor,
    "--brand-contrast": readableOn(venue.brandColor),
  } as React.CSSProperties;

  return (
    <main style={brandStyle} data-domain="diner" className="mx-auto min-h-dvh max-w-2xl bg-surface">
      <header className="border-b border-line px-5 py-5">
        <h1 className="font-display text-xl font-semibold tracking-tight text-ink">
          Payment
        </h1>
        <p className="text-sm text-muted">{venue.name}</p>
      </header>

      <Elements
        stripe={stripePromise}
        options={{
          clientSecret,
          // Stripe Elements render in a cross-origin iframe that can't read our
          // CSS vars, so the cream palette is mirrored here as literal hex (the
          // one sanctioned place). colorPrimary stays the venue brand colour.
          appearance: {
            variables: {
              colorPrimary: venue.brandColor,
              colorBackground: "#fffdf8",
              colorText: "#0e1f18",
              colorTextSecondary: "#6e756b",
              colorDanger: "#cf4527",
              borderRadius: "11px",
            },
            rules: {
              ".Input": { borderColor: "#e6ddcb" },
              ".Input:focus": { borderColor: venue.brandColor },
              ".Label": { color: "#6e756b" },
            },
          },
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
  // Whether a wallet (Apple Pay / Google Pay / Link) is available on this device,
  // reported by the Express Checkout Element's onReady. Gates ONLY that element's
  // heading + divider, so when no wallet exists the card form below is unchanged.
  const [hasWallet, setHasWallet] = useState(false);
  // The payment method the customer has selected in the Payment Element (e.g.
  // "card", "payto"). Carried to the order page as a DISPLAY-ONLY hint so a bank
  // (PayTo) payment shows the "approve in your banking app" waiting screen. It
  // never affects the amount, the fee, or confirmation — the webhook remains the
  // sole source of truth.
  const [selectedMethod, setSelectedMethod] = useState<string>("card");
  // The amount currently shown on the Pay button. Starts at the full (card)
  // price and drops to the discounted total when the customer selects a bank
  // method — the number comes back from the SERVER (applyBankDiscount), which is
  // authoritative; the client never computes the charged amount.
  const [displayAmount, setDisplayAmount] = useState(amountCents);
  // True while the discount is being applied/reverted server-side — the Pay
  // button is disabled so a payment can't be confirmed at a stale amount.
  const [recomputing, setRecomputing] = useState(false);
  const lastMethodRef = useRef<string>("card");

  // The saving on offer for this order (0 when the venue hasn't configured one).
  // Display only; the server recompute is the source of truth.
  const offerDiscountCents =
    venue.paytoEnabled
      ? bankDiscountCents(
          amountCents,
          venue.paytoDiscountMode,
          venue.paytoDiscountValue,
        )
      : 0;

  // When the customer switches payment method, apply (bank) or revert (card) the
  // discount on the server, then re-sync the Payment Element to the new PI
  // amount. Only fires on an actual method-type change; a no-op when no discount
  // is configured.
  async function handleMethodChange(type: string) {
    setSelectedMethod(type);
    if (offerDiscountCents <= 0 || type === lastMethodRef.current) return;
    lastMethodRef.current = type;
    setRecomputing(true);
    try {
      const result = await applyBankDiscount(venue.slug, token, type);
      if (result.ok) {
        setDisplayAmount(result.totalCents);
        try {
          await elements?.fetchUpdates();
        } catch {
          // Element re-sync is best-effort; the charged amount is the PI's.
        }
      }
    } finally {
      setRecomputing(false);
    }
  }

  // SINGLE confirmation path. BOTH the card form submit and the Express Checkout
  // Element's onConfirm call this one helper, which confirms the SAME
  // PaymentIntent placeOrder already created — carried by `elements` (the same
  // connected-account clientSecret + stripeAccount). There is no second intent
  // and no second confirm path; the order is still confirmed ONLY by the
  // signature-verified webhook on payment_intent.succeeded.
  async function confirmAgainstIntent(methodHint?: string) {
    if (!stripe || !elements || submitting || recomputing) return;
    setSubmitting(true);
    setError(null);

    // Display-only hint so the order page can tailor its waiting copy (bank vs
    // card). Not trusted for anything financial. Wallet confirmations pass their
    // own hint; the card form uses the Payment Element's current selection.
    const pm = methodHint ?? selectedMethod;
    const returnUrl = `${window.location.origin}/${venue.slug}/order/${token}?pm=${encodeURIComponent(pm)}`;

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        // After payment Stripe redirects here; the order page reflects the live
        // status (processing → paid via the webhook, or failed).
        return_url: returnUrl,
      },
    });

    // We reach this point only when confirmation did NOT redirect. Two cases:
    //  - confirmError: an immediate failure (declined card, cancelled/failed
    //    wallet, validation) — keep the customer here with a calm retry message.
    //  - no error: an async method (PayTo) that confirmed a mandate without a
    //    redirect and is now `processing` out-of-band. Send the customer to the
    //    order page (same return_url), where the waiting screen + poller take
    //    over until the webhook confirms. This is NOT a second confirm path —
    //    the single confirmPayment above already ran; we only navigate.
    if (confirmError) {
      setError(
        confirmError.message ??
          "We couldn't process that payment. Please check your details and try again.",
      );
      setSubmitting(false);
    } else {
      window.location.assign(returnUrl);
    }
  }

  async function handlePay(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await confirmAgainstIntent();
  }

  return (
    <form onSubmit={handlePay} className="space-y-5 px-5 py-6">
      {/*
        Express Checkout (Apple Pay / Google Pay / Link), mounted ABOVE the card
        form on the SAME Elements instance. On authorization it confirms the SAME
        PaymentIntent via confirmAgainstIntent() — never a second intent or a
        second confirm path; the webhook stays the sole confirmation source. The
        element is always mounted so onReady can report wallet availability; when
        none is available it renders nothing, hasWallet stays false, and the
        heading + divider collapse — leaving the card form exactly as it is
        without this feature. The buttons use their mandated platform styling
        (Apple Pay is not brand-recolorable, per Apple's rules). The wallet's
        returned billing/contact details are ignored — the order already
        snapshotted the customer's name/phone before this step.
      */}
      <div>
        <div className={hasWallet ? "mb-5 space-y-4" : undefined}>
          {hasWallet ? (
            <p className="text-sm font-medium text-ink">Express checkout</p>
          ) : null}
          <ExpressCheckoutElement
            options={{
              buttonType: { applePay: "order", googlePay: "order" },
              buttonTheme: { applePay: "black", googlePay: "black" },
              layout: { maxColumns: 1 },
            }}
            onReady={({ availablePaymentMethods }) =>
              setHasWallet(Boolean(availablePaymentMethods))
            }
            onConfirm={() => confirmAgainstIntent("card")}
          />
          {hasWallet ? (
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-line" />
              <span className="text-xs text-muted">Or pay with card</span>
              <span className="h-px flex-1 bg-line" />
            </div>
          ) : null}
        </div>

        {offerDiscountCents > 0 ? (
          <div className="mb-3 flex items-center gap-2 rounded-input border border-[var(--color-success)]/30 bg-[var(--color-success)]/10 px-3 py-2">
            <span
              aria-hidden
              className="rounded-pill bg-[var(--color-success)]/20 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-success-deep"
            >
              Save ${formatCents(offerDiscountCents)}
            </span>
            <span className="text-xs text-ink">
              {displayAmount < amountCents
                ? "Applied — you're paying by bank."
                : "Pay by bank instead of card."}
            </span>
          </div>
        ) : null}

        <PaymentElement
          onChange={(event) => handleMethodChange(event.value.type)}
        />
      </div>

      {error ? (
        <p className="text-sm text-[var(--color-warm)]" role="alert">
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        variant="primary"
        disabled={!stripe || recomputing}
        loading={submitting}
        loadingLabel="Processing…"
        className="w-full"
      >
        {recomputing ? "Updating total…" : `Pay $${formatCents(displayAmount)}`}
      </Button>

      <p className="text-center text-xs text-muted">
        Payments are securely processed by Stripe.
      </p>
      <Link
        href={`/${venue.slug}`}
        className="block text-center text-xs text-muted underline hover:text-ink"
      >
        Cancel and return to {venue.name}
      </Link>
    </form>
  );
}
