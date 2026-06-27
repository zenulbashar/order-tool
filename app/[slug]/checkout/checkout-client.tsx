"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import { ButtonLabel } from "@/app/_components/spinner";
import { type SchedulingConfig } from "@/lib/schedule";
import { formatCents, type OrderTypeValue } from "@/lib/validation";

import { claimOrder } from "../account/actions";
import { useCart } from "../cart-provider";
import { SchedulePicker } from "../schedule-picker";
import type { PublicVenue } from "../types";
import { placeOrder } from "./actions";
import { PaymentStep } from "./payment-step";
import { rememberCustomerPrefill } from "./prefill-actions";

const fieldClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900";

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

  const brandStyle = { "--brand": venue.brandColor } as React.CSSProperties;

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
        style={brandStyle}
        className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center bg-white px-6 text-center"
      >
        <p className="text-sm text-gray-500">Your cart is empty.</p>
        <Link
          href={`/${venue.slug}`}
          className="mt-4 text-sm font-medium underline"
          style={{ color: "var(--brand)" }}
        >
          ← Back to {venue.name}
        </Link>
      </main>
    );
  }

  return (
    <main style={brandStyle} className="mx-auto min-h-dvh max-w-2xl bg-white">
      <header className="border-b border-gray-100 px-5 py-5">
        <Link
          href={`/${venue.slug}`}
          className="text-xs text-gray-500 hover:text-gray-900"
        >
          ← Back to menu
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-gray-900">
          Checkout
        </h1>
        <p className="text-sm text-gray-500">{venue.name}</p>
      </header>

      <section className="px-5 py-5">
        <h2 className="text-sm font-semibold text-gray-900">Your order</h2>
        <ul className="mt-2 divide-y divide-gray-100">
          {displayLines.map((line) => (
            <li
              key={line.lineId}
              className="flex items-start justify-between gap-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm text-gray-900">
                  <span className="text-gray-500">{line.quantity}×</span>{" "}
                  {line.itemName}
                  {line.variantName ? ` (${line.variantName})` : ""}
                </p>
                {line.options.length > 0 ? (
                  <p className="mt-0.5 text-xs text-gray-500">
                    {line.options.map((o) => o.name).join(", ")}
                  </p>
                ) : null}
              </div>
              <span className="shrink-0 text-sm text-gray-700">
                ${formatCents(line.lineCents)}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3 text-sm">
          <span className="font-medium text-gray-900">Total</span>
          <span className="font-semibold text-gray-900">
            ${formatCents(subtotalCents)}
          </span>
        </div>
      </section>

      <form onSubmit={handleSubmit} className="space-y-5 px-5 pb-10">
        <div className="space-y-1.5">
          <span className="block text-sm font-medium text-gray-900">
            Order type
          </span>
          <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
            {ORDER_TYPE_OPTIONS.map((option) => {
              const isActive = option.value === orderType;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleOrderType(option.value)}
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    isActive ? "bg-white shadow-sm" : "text-gray-500"
                  }`}
                  style={isActive ? { color: "var(--brand)" } : undefined}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {orderType === "dine_in" ? (
          <label className="block text-sm font-medium text-gray-900">
            Table number
            <input
              type="text"
              value={tableLabel}
              onChange={(event) => setTableLabel(event.target.value)}
              maxLength={40}
              required
              placeholder="e.g. 12"
              className={`mt-1 ${fieldClass}`}
            />
          </label>
        ) : null}

        {orderType === "pickup" ? (
          <SchedulePicker
            scheduling={scheduling}
            scheduledFor={scheduledFor}
            onScheduledFor={setScheduledFor}
            nowMs={nowMs}
          />
        ) : null}

        <label className="block text-sm font-medium text-gray-900">
          Name
          <input
            type="text"
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
            maxLength={80}
            required
            autoComplete="name"
            className={`mt-1 ${fieldClass}`}
          />
        </label>

        <label className="block text-sm font-medium text-gray-900">
          Phone <span className="font-normal text-gray-400">(optional)</span>
          <input
            type="tel"
            value={customerPhone}
            onChange={(event) => setCustomerPhone(event.target.value)}
            maxLength={30}
            autoComplete="tel"
            className={`mt-1 ${fieldClass}`}
          />
        </label>

        <label className="block text-sm font-medium text-gray-900">
          Order notes{" "}
          <span className="font-normal text-gray-400">(optional)</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={280}
            rows={2}
            placeholder="Special requests, e.g. no onion"
            className={`mt-1 resize-none ${fieldClass}`}
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
          <ButtonLabel pending={pending} pendingLabel="Starting payment…">
            {`Continue to payment · $${formatCents(subtotalCents)}`}
          </ButtonLabel>
        </button>
        <p className="text-center text-xs text-gray-400">
          Next, pay securely with Stripe.
        </p>
      </form>
    </main>
  );
}
