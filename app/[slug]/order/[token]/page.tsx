import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { readableOn } from "@/app/_components/brand-contrast";
import { StatusBadge, type PaymentTone } from "@/app/_components/status-badge";
import { getCustomer } from "@/lib/customer/auth";
import { formatCents, isReservedSlug, orderReference } from "@/lib/validation";

import { getPublicVenueBySlug } from "../../queries";
import { PaymentStatusPoller } from "./payment-status-poller";
import { getOrderByToken } from "./queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your order" };

type OrderParams = { params: Promise<{ slug: string; token: string }> };

export default async function OrderConfirmationPage({ params }: OrderParams) {
  const { slug, token } = await params;
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

  const brandStyle = {
    "--brand": venue.brandColor,
    "--brand-contrast": readableOn(venue.brandColor),
  } as React.CSSProperties;
  const reference = orderReference(order.publicToken);

  const isPaid = order.status === "confirmed";
  const isPending = order.status === "pending_payment";
  const isFailed = order.status === "payment_failed";

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

  return (
    <main style={brandStyle} data-domain="diner" className="mx-auto min-h-dvh max-w-2xl bg-surface">
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

      <header className="border-b border-line px-5 py-6">
        <p className="text-sm font-medium" style={{ color: "var(--action)" }}>
          {eyebrow}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">
          Thanks, {order.customerName.split(" ")[0]}!
        </h1>
        <p className="mt-1 text-sm text-muted">
          {venue.name} · Reference{" "}
          <span className="font-mono text-ink">{reference}</span>
        </p>
      </header>

      <section className="grid gap-3 px-5 py-5 text-sm sm:grid-cols-2">
        <div className="rounded-card border border-line p-3">
          <p className="text-xs uppercase tracking-wide text-muted">Status</p>
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

      <section className="px-5 pb-6">
        <h2 className="text-sm font-semibold text-ink">Items</h2>
        <ul className="mt-2 divide-y divide-line">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3 py-3">
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

        <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
          <span className="text-sm font-medium text-ink">Total</span>
          <span className="text-base font-semibold text-ink">
            ${formatCents(order.totalCents)}
          </span>
        </div>

        {/* Special request the customer left, echoed back. Plain (React-escaped)
            text node — never raw HTML. */}
        {order.notes ? (
          <div className="mt-4 rounded-card border border-line bg-surface p-3">
            <p className="text-xs uppercase tracking-wide text-muted">Notes</p>
            <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-ink">
              {order.notes}
            </p>
          </div>
        ) : null}
      </section>

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
