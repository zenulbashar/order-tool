import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  StatusBadge,
  type KitchenTone,
  type PaymentTone,
} from "@/app/_components/status-badge";
import { getCustomer } from "@/lib/customer/auth";
import { formatVenueTime } from "@/lib/time";
import { formatCents, isReservedSlug, orderReference } from "@/lib/validation";

import { dinerBrandStyle } from "../../brand-style";
import { getPublicVenueBySlug } from "../../queries";
import { PaymentStatusPoller } from "./payment-status-poller";
import { getOrderByToken, type ConfirmedOrder } from "./queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your order" };

type OrderParams = {
  params: Promise<{ slug: string; token: string }>;
  // `pm` is a display-only hint from the payment step (the method the customer
  // chose). It tailors the waiting UX (bank vs card) and is never trusted for
  // anything financial — the order's own status is the source of truth.
  searchParams: Promise<{ pm?: string }>;
};

// Async bank methods that show the "approve in your banking app" waiting screen.
const BANK_METHODS = new Set(["payto", "au_becs_debit"]);

/**
 * The forest-dark "approve in your banking app" waiting screen (PayTo). Shown
 * only while a bank payment is pending — the customer has confirmed the mandate
 * and now approves it out-of-band, which can take a minute or two. Three honest
 * steps: request sent → approve in app → we start your order. The poller flips
 * the page to the paid tracker the moment the webhook confirms.
 */
function PayToWaiting({ amountCents }: { amountCents: number }) {
  const steps: { title: string; sub: string; state: StepState }[] = [
    {
      title: "Request sent",
      sub: "We've sent a payment request to your bank.",
      state: "complete",
    },
    {
      title: "Approve in your banking app",
      sub: "Open your banking app and approve the request to pay.",
      state: "active",
    },
    {
      title: "We start your order",
      sub: "The kitchen begins the moment your bank confirms.",
      state: "upcoming",
    },
  ];

  return (
    <div className="rounded-card bg-forest-deep p-6 text-concierge-sage shadow-card">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-concierge-mint">
        Pay by bank
      </p>
      <p className="mt-2 font-display text-2xl font-extrabold text-white">
        Approve ${formatCents(amountCents)} in your banking app
      </p>
      <p className="mt-1 text-sm text-concierge-sage">
        Your bank sends you a request to approve — it can take a minute or two.
        Keep this page open; it updates on its own.
      </p>

      <ol className="mt-5 space-y-3">
        {steps.map((step) => (
          <li key={step.title} className="flex items-start gap-3">
            <span
              aria-hidden
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                step.state === "complete"
                  ? "bg-concierge-mint text-forest"
                  : step.state === "active"
                    ? "bg-concierge-mint/20 text-concierge-mint p2e-ring"
                    : "border border-concierge-sage/30 text-concierge-sage/60"
              }`}
            >
              {step.state === "complete" ? "✓" : ""}
            </span>
            <div className="min-w-0">
              <p
                className={`text-sm font-bold ${
                  step.state === "upcoming" ? "text-concierge-sage/60" : "text-white"
                }`}
              >
                {step.title}
              </p>
              <p className="text-xs text-concierge-sage">{step.sub}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

type Fulfillment = ConfirmedOrder["fulfillmentStatus"];
type StepState = "complete" | "active" | "upcoming";

// Kitchen lifecycle → the header pill's tone, reusing the same tones the owner
// board renders so the diner sees the identical status language.
const kitchenTone: Record<Fulfillment, KitchenTone> = {
  new: "new",
  preparing: "preparing",
  ready: "ready",
  completed: "done",
};

/**
 * The three-step Placed → Preparing → Ready tracker, shown ONLY once payment is
 * confirmed. Placed is complete the moment the order is paid; Preparing/Ready
 * advance with the kitchen's fulfillmentStatus. We deliberately show NO ETA —
 * the app stores no time estimate, so the hero is an honest status phrase (and,
 * for scheduled pickups, the real pickup time) rather than a fabricated "~8 min".
 */
function OrderTracker({
  order,
  timeZone,
}: {
  order: ConfirmedOrder;
  timeZone: string;
}) {
  const f = order.fulfillmentStatus;
  const isDineIn = order.orderType === "dine_in";

  const steps: { label: string; glyph: string; state: StepState }[] = [
    { label: "Placed", glyph: "🧾", state: "complete" },
    {
      label: "Preparing",
      glyph: "🍳",
      state:
        f === "preparing"
          ? "active"
          : f === "ready" || f === "completed"
            ? "complete"
            : "upcoming",
    },
    {
      label: "Ready",
      glyph: isDineIn ? "🍽️" : "🛍️",
      state: f === "ready" ? "active" : f === "completed" ? "complete" : "upcoming",
    },
  ];

  const hero: Record<Fulfillment, { title: string; sub: string }> = {
    new: {
      title: "Order received",
      sub: "The kitchen has your order and will start it shortly.",
    },
    preparing: {
      title: "In the kitchen",
      sub: "Your order is being prepared right now.",
    },
    ready: {
      title: "Ready to collect",
      sub: isDineIn
        ? "It's on its way to your table."
        : "Come grab it at the counter.",
    },
    completed: { title: "All done", sub: "Enjoy — thanks for ordering." },
  };

  return (
    <div className="rounded-card border border-line bg-surface p-5 shadow-sm">
      <div className="mb-5 text-center">
        <p className="font-display text-3xl font-extrabold tracking-tight text-ink">
          {hero[f].title}
        </p>
        <p className="mt-1 text-sm text-muted">{hero[f].sub}</p>
        {order.scheduledFor ? (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-control bg-sand px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-wide text-muted">
            Scheduled pickup · {formatVenueTime(order.scheduledFor, timeZone)}
          </p>
        ) : null}
      </div>

      <ol className="flex items-start">
        {steps.map((step, i) => (
          <li key={step.label} className="contents">
            {i > 0 ? (
              <span
                aria-hidden
                className={`mt-[15px] h-0.5 flex-[0_0_1.5rem] rounded-full ${
                  steps[i - 1].state === "complete" ? "bg-ink" : "bg-sand"
                }`}
              />
            ) : null}
            <div className="flex flex-1 flex-col items-center">
              <span
                aria-hidden
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm ${
                  step.state === "complete"
                    ? "bg-ink text-accent"
                    : step.state === "active"
                      ? "bg-accent text-forest p2e-ring"
                      : "border border-line bg-surface text-muted"
                }`}
              >
                {step.state === "complete" ? "✓" : step.glyph}
              </span>
              <span
                className={`mt-2 text-[11px] font-bold ${
                  step.state === "upcoming" ? "text-muted" : "text-ink"
                }`}
              >
                {step.label}
              </span>
              {step.state === "active" ? (
                <span className="font-mono text-[9px] uppercase tracking-wide text-accent-deep">
                  now
                </span>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      {/* Screen-reader summary of the same progress the circles convey visually. */}
      <p className="sr-only" aria-live="polite">
        Order status: {hero[f].title}.
      </p>
    </div>
  );
}

export default async function OrderConfirmationPage({
  params,
  searchParams,
}: OrderParams) {
  const { slug, token } = await params;
  const { pm } = await searchParams;
  if (isReservedSlug(slug)) notFound();

  const venue = await getPublicVenueBySlug(slug);
  if (!venue) notFound();

  // Resolved by opaque token AND venue — never by sequential id.
  const order = await getOrderByToken(venue.id, token);
  if (!order) notFound();

  // Opt-in customer association (#7). Only resolves a session for THIS venue;
  // null for guests, who see the unchanged confirmation. Does not affect the
  // order itself — linking is a separate, explicit action.
  const customer = await getCustomer(venue.id);

  const brandStyle = dinerBrandStyle(venue);
  const reference = orderReference(order.publicToken);

  const isPaid = order.status === "confirmed";
  const isPending = order.status === "pending_payment";
  const isFailed = order.status === "payment_failed";
  // Bank (PayTo) payments approve out-of-band — show the waiting screen + the
  // gentler, longer poll while pending. Hint only; the order status still rules.
  const isBankPending = isPending && pm != null && BANK_METHODS.has(pm);

  const statusLabel = isPaid
    ? "Paid"
    : isPending
      ? "Payment processing"
      : isFailed
        ? "Payment not completed"
        : "Cancelled";

  const statusTone: PaymentTone = isPaid
    ? "paid"
    : isPending
      ? "processing"
      : isFailed
        ? "failed"
        : "cancelled";

  const eyebrow = isPaid
    ? "Order confirmed"
    : isPending
      ? "Almost there"
      : isFailed
        ? "Payment not completed"
        : "Order cancelled";

  // The order summary + notes are shared: on the paid screen they sit in the
  // sticky right column beside the tracker; on the other states they stack below
  // the status. Extracted so the two layouts render the exact same markup.
  const orderSummaryCard = (
    <div className="rounded-card border border-line bg-surface p-4">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
        Your order
      </p>
      <ul className="mt-2 divide-y divide-line">
        {order.items.map((item) => (
          <li
            key={item.id}
            className="flex items-start justify-between gap-3 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm text-ink">
                <span className="text-muted">{item.quantity}×</span>{" "}
                {item.name}
                {item.variantName ? ` (${item.variantName})` : ""}
              </p>
              {item.modifiers.length > 0 ? (
                <p className="mt-0.5 text-xs text-muted">
                  {item.modifiers.map((m) => m.name).join(", ")}
                </p>
              ) : null}
            </div>
            <span className="shrink-0 text-sm text-ink">
              ${formatCents(item.lineTotalCents)}
            </span>
          </li>
        ))}
      </ul>
      {order.discountCents > 0 ? (
        <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-sm">
          <span className="text-muted">Subtotal</span>
          <span className="text-ink">${formatCents(order.subtotalCents)}</span>
        </div>
      ) : null}
      {order.promoDiscountCents > 0 ? (
        <div className="mt-1 flex items-center justify-between text-sm">
          <span className="text-success-deep">Promotion</span>
          <span className="text-success-deep">
            −${formatCents(order.promoDiscountCents)}
          </span>
        </div>
      ) : null}
      {order.discountCents - order.promoDiscountCents > 0 ? (
        <div className="mt-1 flex items-center justify-between text-sm">
          <span className="text-success-deep">Bank discount</span>
          <span className="text-success-deep">
            −${formatCents(order.discountCents - order.promoDiscountCents)}
          </span>
        </div>
      ) : null}
      <div
        className={`flex items-center justify-between ${
          order.discountCents > 0 ? "mt-2" : "mt-3 border-t border-line pt-3"
        }`}
      >
        <span className="text-sm font-medium text-ink">Total</span>
        <span className="font-display text-lg font-extrabold text-ink">
          ${formatCents(order.totalCents)}
        </span>
      </div>
      {order.taxCents > 0 ? (
        <p className="mt-1 text-right text-xs text-muted">
          incl. {venue.taxLabel} ${formatCents(order.taxCents)}
        </p>
      ) : null}
    </div>
  );

  const orderNotes = order.notes ? (
    <div className="mt-4 rounded-card border border-line bg-surface p-3">
      <p className="text-xs uppercase tracking-wide text-muted">Notes</p>
      <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-ink">
        {order.notes}
      </p>
    </div>
  ) : null;

  return (
    <main
      style={brandStyle}
      data-domain="diner"
      className="mx-auto min-h-dvh max-w-2xl bg-surface lg:max-w-[880px]"
    >
      {/* Status banner — paid / processing / failed must each be unmistakable
          and, for the unhappy paths, calm and non-alarming. */}
      {isPaid ? (
        <div className="bg-[var(--color-success)]/15 px-5 py-2 text-center text-xs font-medium text-success-deep">
          Payment received — your order is confirmed.
        </div>
      ) : isPending ? (
        <div className="bg-[var(--color-accent)]/15 px-5 py-2 text-center text-xs font-medium text-accent-deep">
          Waiting for payment confirmation…
        </div>
      ) : isFailed ? (
        <div className="bg-[var(--color-warm)]/15 px-5 py-2 text-center text-xs font-medium text-[var(--color-warm-deep)]">
          Payment was not completed — no charge was made.
        </div>
      ) : (
        <div className="bg-sand px-5 py-2 text-center text-xs font-medium text-muted">
          This order was cancelled.
        </div>
      )}

      <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-6">
        <div className="min-w-0">
          <p className="text-sm font-medium" style={{ color: "var(--action)" }}>
            {eyebrow}
          </p>
          <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-ink">
            Thanks, {order.customerName.split(" ")[0]}!
          </h1>
          <p className="mt-1 text-sm text-muted">
            {venue.name}
            {isPaid
              ? order.orderType === "dine_in"
                ? ` · Table ${order.tableLabel ?? "—"}`
                : " · Pickup"
              : ""}{" "}
            · Reference <span className="font-mono text-ink">{reference}</span>
          </p>
        </div>
        {isPaid ? (
          <StatusBadge
            tone={kitchenTone[order.fulfillmentStatus]}
            className="mt-1 shrink-0"
          />
        ) : null}
      </header>

      {isPaid ? (
        /* Paid → live tracker (left) beside the order summary (right) on desktop;
           a single stacked column on mobile. */
        <div className="px-5 py-5 lg:grid lg:grid-cols-[1fr_320px] lg:items-start lg:gap-6">
          <section className="space-y-4">
            <OrderTracker order={order} timeZone={venue.timezone} />
            {order.fulfillmentStatus !== "completed" ? (
              <div className="flex items-start gap-3 rounded-card border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/12 px-4 py-3">
                <span
                  aria-hidden
                  className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-accent"
                />
                <p className="text-xs leading-relaxed text-accent-deep">
                  <b className="text-ink">The kitchen&apos;s on it.</b>{" "}
                  We&apos;ll let you know the moment it&apos;s ready — no need to
                  watch this screen.
                </p>
              </div>
            ) : null}
          </section>
          <aside className="mt-5 lg:mt-0 lg:sticky lg:top-6">
            {orderSummaryCard}
            {orderNotes}
          </aside>
        </div>
      ) : (
        <>
          {isBankPending ? (
            /* Bank (PayTo) pending → the forest-dark approve-in-your-bank-app
               screen with the gentler, longer poll. */
            <section className="space-y-3 px-5 py-5">
              <PayToWaiting amountCents={order.totalCents} />
              <PaymentStatusPoller variant="bank" />
              <div className="rounded-card border border-line p-3 text-sm">
                <p className="text-xs uppercase tracking-wide text-muted">
                  {order.orderType === "dine_in" ? "Dine-in" : "Pickup"}
                </p>
                <p className="mt-0.5 font-medium text-ink">
                  {order.orderType === "dine_in"
                    ? `Table ${order.tableLabel ?? "—"}`
                    : "Collect at the counter"}
                </p>
              </div>
            </section>
          ) : (
            /* Pre-payment states keep the payment-status card + bounded poller. */
            <section className="grid gap-3 px-5 py-5 text-sm sm:grid-cols-2">
              <div className="rounded-card border border-line p-3">
                <p className="text-xs uppercase tracking-wide text-muted">
                  Status
                </p>
                <p className="mt-1">
                  <StatusBadge tone={statusTone}>{statusLabel}</StatusBadge>
                </p>
                {isPending ? <PaymentStatusPoller /> : null}
                {isFailed ? (
                  <p className="mt-2 text-sm text-muted">
                    No payment was taken. You can try again from the menu.
                  </p>
                ) : null}
              </div>
              <div className="rounded-card border border-line p-3">
                <p className="text-xs uppercase tracking-wide text-muted">
                  {order.orderType === "dine_in" ? "Dine-in" : "Pickup"}
                </p>
                <p className="mt-0.5 font-medium text-ink">
                  {order.orderType === "dine_in"
                    ? `Table ${order.tableLabel ?? "—"}`
                    : "Collect at the counter"}
                </p>
              </div>
            </section>
          )}

          <section className="px-5 pb-6">
            {orderSummaryCard}
            {orderNotes}
          </section>
        </>
      )}

      {/* Opt-in account association (#7). A SIGNED-IN customer's order is already
          auto-linked at checkout (the fire-and-forget claimOrder), so it's
          already in their history — we confirm that and point to it rather than
          prompting a redundant "save". A GUEST gets the invitation to sign in and
          claim it. Never required; the order is complete either way. */}
      <section className="border-t border-line px-5 py-5">
        {customer ? (
          <p className="text-sm text-muted">
            Saved to your account.{" "}
            <Link
              href={`/${venue.slug}/account`}
              className="font-medium underline"
              style={{ color: "var(--action)" }}
            >
              View your orders
            </Link>
          </p>
        ) : (
          <Link
            href={`/${venue.slug}/account`}
            className="text-sm font-medium underline"
            style={{ color: "var(--action)" }}
          >
            Sign in to save this order &amp; reorder later
          </Link>
        )}
      </section>

      <div className="px-5 pb-10">
        {isFailed ? (
          <Link
            href={`/${venue.slug}`}
            className="inline-block rounded-control px-4 py-2 text-sm font-semibold text-[var(--action-contrast)] transition"
            style={{ backgroundColor: "var(--action)" }}
          >
            Try again
          </Link>
        ) : (
          <Link
            href={`/${venue.slug}`}
            className="text-sm font-medium underline"
            style={{ color: "var(--action)" }}
          >
            ← Back to {venue.name}
          </Link>
        )}
      </div>
    </main>
  );
}
