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
import { useEffect, useMemo, useRef, useState } from "react";

import { readableOn } from "@/app/_components/brand-contrast";
import { Button } from "@/app/_components/button";
import { bankDiscountCents } from "@/lib/payments/bank-discount";
import { formatCents } from "@/lib/validation";

import { applyOrderDiscounts } from "./discount-actions";

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
  pointsBalance,
}: {
  venue: PublicVenue;
  clientSecret: string;
  stripeAccountId: string;
  publishableKey: string;
  token: string;
  amountCents: number;
  pointsBalance: number;
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
        <PaymentForm
          venue={venue}
          token={token}
          amountCents={amountCents}
          pointsBalance={pointsBalance}
        />
      </Elements>
    </main>
  );
}

function PaymentForm({
  venue,
  token,
  amountCents,
  pointsBalance,
}: {
  venue: PublicVenue;
  token: string;
  amountCents: number;
  pointsBalance: number;
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
  // The amount currently shown on the Pay button. Starts at the full price and
  // drops to the discounted total once a promotion and/or the bank saving apply
  // — the number comes back from the SERVER (applyOrderDiscounts), which is
  // authoritative; the client never computes the charged amount.
  const [displayAmount, setDisplayAmount] = useState(amountCents);
  // True while the discount is being applied/reverted server-side — the Pay
  // button is disabled so a payment can't be confirmed at a stale amount.
  const [recomputing, setRecomputing] = useState(false);
  // The platform promotion applied to this order (cents), from the server.
  const [promoDiscountCents, setPromoDiscountCents] = useState(0);
  // Loyalty points redemption (cents) applied by the server this recompute, plus
  // the toggle state + a ref so every recompute (mount / method / code) carries
  // the current redeem choice. Server-authoritative — the client only asks.
  const [pointsDiscountCents, setPointsDiscountCents] = useState(0);
  const [redeeming, setRedeeming] = useState(false);
  const redeemRef = useRef(false);
  const lastMethodRef = useRef<string>("card");
  // Diner-entered promo/discount CODE in effect (re-sent on every recompute so a
  // method change keeps it). Empty = no code → auto promos only. The server is
  // authoritative: the code only NAMES a promo; it can never set an amount.
  const appliedCodeRef = useRef<string>("");
  const [codeInput, setCodeInput] = useState("");
  const [codeStatus, setCodeStatus] = useState<"idle" | "applied" | "invalid">(
    "idle",
  );

  // The pay-by-bank saving on offer for this order (0 when the venue hasn't
  // configured one). Display only; the server recompute is the source of truth.
  const offerDiscountCents =
    venue.paytoEnabled
      ? bankDiscountCents(
          amountCents,
          venue.paytoDiscountMode,
          venue.paytoDiscountValue,
        )
      : 0;

  // The SINGLE apply path (Track E2d). Recomputes both discounts server-side for
  // the given method, updates the PI + order, and re-syncs the Element. Used for
  // the automatic promo apply on mount AND every method change, so a promotion
  // and the bank saving STACK rather than clobber each other.
  async function runDiscount(type: string) {
    setRecomputing(true);
    try {
      const result = await applyOrderDiscounts(
        venue.slug,
        token,
        type,
        appliedCodeRef.current || undefined,
        redeemRef.current,
      );
      if (result.ok) {
        setDisplayAmount(result.totalCents);
        setPromoDiscountCents(result.promoDiscountCents);
        setPointsDiscountCents(result.pointsDiscountCents);
        // Reconcile the toggle with what the server actually redeemed (e.g. a
        // small basket may leave no room, or the balance was already spent).
        setRedeeming(result.pointsRedeemed > 0);
        redeemRef.current = result.pointsRedeemed > 0;
        // Reflect whether an entered code took (auto-only applies leave it idle).
        if (appliedCodeRef.current) {
          setCodeStatus(result.codeApplied ? "applied" : "invalid");
        }
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

  // Apply (or clear) the diner-entered code, then recompute at the current
  // method. An unknown code falls back to auto promos server-side, so pressing
  // Apply never removes an existing discount — it just reports "not valid".
  function applyCode() {
    if (recomputing) return;
    appliedCodeRef.current = codeInput.trim().toUpperCase();
    setCodeStatus("idle");
    void runDiscount(lastMethodRef.current);
  }

  // Apply any active promotion automatically once, as soon as the step mounts —
  // it must not depend on the customer touching the method selector. Fail-closed:
  // if this never runs, the customer simply pays full price.
  const appliedOnMount = useRef(false);
  useEffect(() => {
    if (appliedOnMount.current) return;
    appliedOnMount.current = true;
    void runDiscount(lastMethodRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Whether to offer redeeming points: the venue runs loyalty and the signed-in
  // diner has at least the minimum redeemable balance. The exact amount is
  // server-computed on apply; this only gates the control.
  const canRedeem =
    venue.loyaltyEnabled &&
    pointsBalance > 0 &&
    pointsBalance >= Math.max(1, venue.loyaltyMinRedeemPoints);

  // Toggle points redemption, then recompute at the current method (the server
  // reconciles the toggle to what it could actually redeem).
  function handleRedeemToggle() {
    if (recomputing) return;
    const next = !redeemRef.current;
    redeemRef.current = next;
    setRedeeming(next);
    void runDiscount(lastMethodRef.current);
  }

  // On an actual method-type change, recompute (adds/removes the bank saving on
  // top of any promo). The server no-op guard makes a redundant selection cheap.
  function handleMethodChange(type: string) {
    setSelectedMethod(type);
    if (type === lastMethodRef.current) return;
    lastMethodRef.current = type;
    void runDiscount(type);
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

        {/* Promo code entry (owner discount codes, quick-win #4). type="button"
            + Enter-handling so it never submits the payment form. */}
        <div className="mb-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={codeInput}
              onChange={(event) => {
                setCodeInput(event.target.value);
                if (codeStatus !== "idle") setCodeStatus("idle");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applyCode();
                }
              }}
              placeholder="Promo code"
              autoCapitalize="characters"
              autoComplete="off"
              maxLength={24}
              aria-label="Promo code"
              className="min-w-0 flex-1 rounded-input border border-line bg-surface-elevated px-3 py-2 text-sm uppercase text-ink placeholder:normal-case placeholder:text-muted focus-visible:border-[var(--color-accent)] focus-visible:shadow-[var(--focus-ring-input)] focus-visible:outline-none"
            />
            <button
              type="button"
              onClick={applyCode}
              disabled={recomputing || codeInput.trim().length === 0}
              className="shrink-0 rounded-control border border-line-strong bg-surface-elevated px-4 py-2 text-sm font-semibold text-ink transition hover:bg-hover-secondary disabled:opacity-50"
            >
              Apply
            </button>
          </div>
          {codeStatus === "invalid" ? (
            <p className="mt-1 text-xs text-[var(--color-warm)]">
              That code isn&rsquo;t valid for this order.
            </p>
          ) : codeStatus === "applied" ? (
            <p className="mt-1 text-xs text-success-deep">Code applied.</p>
          ) : null}
        </div>

        {/* Promotion applied automatically (Track E2d). */}
        {promoDiscountCents > 0 ? (
          <div className="mb-3 flex items-center gap-2 rounded-input border border-[var(--color-success)]/30 bg-[var(--color-success)]/10 px-3 py-2">
            <span
              aria-hidden
              className="rounded-pill bg-[var(--color-success)]/20 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-success-deep"
            >
              −${formatCents(promoDiscountCents)}
            </span>
            <span className="text-xs text-ink">Promotion applied to your order.</span>
          </div>
        ) : null}

        {offerDiscountCents > 0 ? (
          <div className="mb-3 flex items-center gap-2 rounded-input border border-[var(--color-success)]/30 bg-[var(--color-success)]/10 px-3 py-2">
            <span
              aria-hidden
              className="rounded-pill bg-[var(--color-success)]/20 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-success-deep"
            >
              Save ${formatCents(offerDiscountCents)}
            </span>
            <span className="text-xs text-ink">
              Pay by bank to save on top of any promotion.
            </span>
          </div>
        ) : null}

        {/* Loyalty redemption — signed-in diners with a redeemable balance can
            apply their points as a discount. The server computes the exact
            amount; this toggle just asks. */}
        {canRedeem ? (
          <div className="mb-3 rounded-input border border-line bg-surface-elevated px-3 py-2.5">
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="text-sm font-medium text-ink">
                  Use your points
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  {pointsBalance.toLocaleString("en-AU")} points available
                  {pointsDiscountCents > 0
                    ? ` · −$${formatCents(pointsDiscountCents)} applied`
                    : ""}
                </span>
              </span>
              <input
                type="checkbox"
                checked={redeeming}
                onChange={handleRedeemToggle}
                disabled={recomputing}
                aria-label="Redeem points on this order"
                className="h-5 w-5 shrink-0 accent-[var(--color-accent)]"
              />
            </label>
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
