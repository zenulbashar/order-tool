"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import { readableOn } from "@/app/_components/brand-contrast";
import { Button } from "@/app/_components/button";
import { Field } from "@/app/_components/field";
import { Input } from "@/app/_components/input";
import { Segmented } from "@/app/_components/segmented";
import { Textarea } from "@/app/_components/textarea";
import { type SchedulingConfig } from "@/lib/schedule";
import { formatCents, type OrderTypeValue } from "@/lib/validation";

import { claimOrder } from "../account/actions";
import { BrandBackdrop } from "../brand-backdrop";
import { useCart } from "../cart-provider";
import { SchedulePicker } from "../schedule-picker";
import type { PublicVenue } from "../types";
import { placeOrder } from "./actions";
import { PaymentStep } from "./payment-step";
import { rememberCustomerPrefill } from "./prefill-actions";

const ORDER_TYPE_OPTIONS: { value: OrderTypeValue; label: string }[] = [
  { value: "pickup", label: "Pickup" },
  { value: "dine_in", label: "Dine-in" },
];

// Everything the payment step needs once the order + PaymentIntent exist.
type PaymentSession = {
  clientSecret: string;
  stripeAccountId: string;
  publishableKey: string;
  token: string;
  amountCents: number;
};

export function CheckoutClient({
  venue,
  initialOrderType,
  initialTable,
  initialName,
  initialPhone,
  nowMs,
}: {
  venue: PublicVenue;
  initialOrderType: OrderTypeValue;
  initialTable: string;
  // Name/phone form DEFAULTS resolved server-side (session record, else the
  // device remember-me cookie, else empty). Pre-filled but fully editable.
  initialName: string;
  initialPhone: string;
  // Request-time "now" (server-captured) so the picker offers fresh slots with no
  // client clock read; the server re-validates on submit.
  nowMs: number;
}) {
  const { displayLines, subtotalCents, count, lines, clear } = useCart();

  const [orderType, setOrderType] = useState<OrderTypeValue>(initialOrderType);
  const [tableLabel, setTableLabel] = useState(initialTable);
  const [scheduledFor, setScheduledFor] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState(initialName);
  const [customerPhone, setCustomerPhone] = useState(initialPhone);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [payment, setPayment] = useState<PaymentSession | null>(null);

  const brandStyle = {
    "--brand": venue.brandColor,
    "--brand-contrast": readableOn(venue.brandColor),
  } as React.CSSProperties;

  // Scheduled-pickup config for the picker (Phase 8) — the same values the server
  // gate validates against. Offered only when enabled + opening hours are set.
  const scheduling = useMemo<SchedulingConfig | null>(
    () =>
      venue.schedulingEnabled &&
      venue.openingHours &&
      venue.openingHours.length > 0
        ? {
            timeZone: venue.timezone,
            openingHours: venue.openingHours,
            leadMinutes: venue.schedulingLeadMinutes,
            maxDaysAhead: venue.schedulingMaxDaysAhead,
          }
        : null,
    [venue],
  );

  // Switching away from pickup clears any scheduled time (dine-in is always now).
  function handleOrderType(next: OrderTypeValue) {
    setOrderType(next);
    if (next !== "pickup") setScheduledFor(null);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return; // double-submit guard (also disables the button)
    setError(null);
    startTransition(async () => {
      const result = await placeOrder({
        slug: venue.slug,
        orderType,
        tableLabel: orderType === "dine_in" ? tableLabel : null,
        customerName,
        // Send null (not "") when blank, consistent with tableLabel's shape; the
        // schema accepts both, but this keeps the optional contract uniform.
        customerPhone: customerPhone.trim() ? customerPhone : null,
        // Optional special request; same blank -> null shape. Server trims,
        // caps, and stores it — it never affects pricing.
        notes: notes.trim() ? notes : null,
        // Scheduled pickup wall-clock (pickup only); the server re-validates it
        // against the venue's hours + lead/max in the venue timezone.
        scheduledFor: orderType === "pickup" ? scheduledFor : null,
        lines: lines.map((line) => ({
          itemId: line.itemId,
          // Chosen size id only (null for flat items) — never a price. The server
          // re-validates it venue-scoped and reads the price from the DB.
          variantId: line.variantId,
          selectedOptionIds: line.selectedOptionIds,
          quantity: line.quantity,
        })),
      });
      if (result.ok) {
        // The order is persisted server-side and the PaymentIntent exists; the
        // cart is now spent. Advance to the Stripe payment step.
        clear();
        // Auto-link this just-placed order to the customer IF they're signed in
        // (#7). Fire-and-forget and a no-op for guests, so it never blocks the
        // payment step — and it never touches how the order was created/priced:
        // placeOrder already returned, and claimOrder only sets the nullable
        // customer_id on this order (token possession + session = proof).
        void claimOrder(venue.slug, result.token).catch(() => {});
        // Remember name+phone on THIS device for next time's pre-fill (item 4).
        // Fire-and-forget and guest-gated server-side: it's skipped for a signed-
        // in customer (their session pre-fills) and only ever sets a non-auth
        // name+phone cookie — no session, no history access.
        void rememberCustomerPrefill(
          venue.slug,
          customerName,
          customerPhone.trim() ? customerPhone : null,
        ).catch(() => {});
        setPayment({
          clientSecret: result.clientSecret,
          stripeAccountId: result.stripeAccountId,
          publishableKey: result.publishableKey,
          token: result.token,
          amountCents: result.amountCents,
        });
      } else {
        setError(result.error);
      }
    });
  }

  // Once a payment session exists, hand off entirely to the Stripe step. (The
  // cart is intentionally empty by now, so this check must come before the
  // empty-cart guard below.)
  if (payment) {
    return (
      <PaymentStep
        venue={venue}
        clientSecret={payment.clientSecret}
        stripeAccountId={payment.stripeAccountId}
        publishableKey={payment.publishableKey}
        token={payment.token}
        amountCents={payment.amountCents}
      />
    );
  }

  if (count === 0) {
    return (
      <main
        style={brandStyle} data-domain="diner"
        className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center bg-surface px-6 text-center"
      >
        <p className="text-sm text-muted">Your cart is empty.</p>
        <Link
          href={`/${venue.slug}`}
          className="mt-4 text-sm font-medium underline"
          style={{ color: "var(--action)" }}
        >
          ← Back to {venue.name}
        </Link>
      </main>
    );
  }

  return (
    <>
      <BrandBackdrop backgroundUrl={venue.backgroundUrl} />
      <main
        style={brandStyle}
        data-domain="diner"
        className="relative mx-auto min-h-dvh max-w-2xl bg-surface lg:shadow-xl"
      >
      <header className="border-b border-line px-5 py-5">
        <Link
          href={`/${venue.slug}`}
          className="text-xs text-muted hover:text-ink"
        >
          ← Back to menu
        </Link>
        <h1 className="mt-2 font-display text-xl font-semibold tracking-tight text-ink">
          Checkout
        </h1>
        <p className="text-sm text-muted">{venue.name}</p>
      </header>

      <section className="px-5 py-5">
        <h2 className="font-mono text-[11px] font-bold uppercase tracking-wider text-label">
          Your order
        </h2>
        <ul className="mt-2 divide-y divide-line">
          {displayLines.map((line) => (
            <li
              key={line.lineId}
              className="flex items-start justify-between gap-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm text-ink">
                  <span className="text-muted">{line.quantity}×</span>{" "}
                  {line.itemName}
                  {line.variantName ? ` (${line.variantName})` : ""}
                </p>
                {line.options.length > 0 ? (
                  <p className="mt-0.5 text-xs text-muted">
                    {line.options.map((o) => o.name).join(", ")}
                  </p>
                ) : null}
              </div>
              <span className="shrink-0 text-sm text-ink">
                ${formatCents(line.lineCents)}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-sm">
          <span className="font-medium text-ink">Total</span>
          <span className="font-display font-semibold text-ink">
            ${formatCents(subtotalCents)}
          </span>
        </div>
        {venue.taxEnabled && venue.taxRateBps > 0 ? (
          <p className="mt-1 text-right text-xs text-muted">
            incl. {venue.taxLabel} $
            {formatCents(
              Math.round(
                (subtotalCents * venue.taxRateBps) / (10000 + venue.taxRateBps),
              ),
            )}
          </p>
        ) : null}
      </section>

      <form onSubmit={handleSubmit} className="space-y-5 px-5 pb-10">
        <div className="space-y-1.5">
          <span className="block font-mono text-[11px] font-bold uppercase tracking-wider text-label">
            Order type
          </span>
          <Segmented
            label="Order type"
            value={orderType}
            onChange={handleOrderType}
            options={ORDER_TYPE_OPTIONS}
          />
        </div>

        {orderType === "dine_in" ? (
          <Field label="Table number" htmlFor="table">
            <Input
              id="table"
              type="text"
              value={tableLabel}
              onChange={(event) => setTableLabel(event.target.value)}
              maxLength={40}
              required
              placeholder="e.g. 12"
            />
          </Field>
        ) : null}

        {orderType === "pickup" ? (
          <SchedulePicker
            scheduling={scheduling}
            scheduledFor={scheduledFor}
            onScheduledFor={setScheduledFor}
            nowMs={nowMs}
          />
        ) : null}

        <Field label="Name" htmlFor="name">
          <Input
            id="name"
            type="text"
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
            maxLength={80}
            required
            autoComplete="name"
          />
        </Field>

        <Field
          label={
            <>
              Phone <span className="font-normal text-muted">(optional)</span>
            </>
          }
          htmlFor="phone"
        >
          <Input
            id="phone"
            type="tel"
            value={customerPhone}
            onChange={(event) => setCustomerPhone(event.target.value)}
            maxLength={30}
            autoComplete="tel"
          />
        </Field>

        <Field
          label={
            <>
              Order notes{" "}
              <span className="font-normal text-muted">(optional)</span>
            </>
          }
          htmlFor="notes"
        >
          <Textarea
            id="notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={280}
            rows={2}
            placeholder="Special requests, e.g. no onion"
            className="resize-none"
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
          loadingLabel="Starting payment…"
          className="w-full"
        >
          {`Continue to payment · $${formatCents(subtotalCents)}`}
        </Button>
        <p className="text-center text-xs text-muted">
          Next, pay securely with Stripe.
        </p>
      </form>
      </main>
    </>
  );
}
