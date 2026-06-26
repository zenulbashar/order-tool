import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

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

  const brandStyle = { "--brand": venue.brandColor } as React.CSSProperties;
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

  const eyebrow = isPaid
    ? "Order confirmed"
    : isPending
      ? "Almost there"
      : isFailed
        ? "Payment not completed"
        : "Order cancelled";

  return (
    <main style={brandStyle} className="mx-auto min-h-dvh max-w-2xl bg-white">
      {/* Status banner — paid / processing / failed must each be unmistakable
          and, for the unhappy paths, calm and non-alarming. */}
      {isPaid ? (
        <div className="bg-green-100 px-5 py-2 text-center text-xs font-medium text-green-800">
          Payment received — your order is confirmed.
        </div>
      ) : isPending ? (
        <div className="bg-amber-100 px-5 py-2 text-center text-xs font-medium text-amber-800">
          Waiting for payment confirmation…
        </div>
      ) : isFailed ? (
        <div className="bg-red-100 px-5 py-2 text-center text-xs font-medium text-red-800">
          Payment was not completed — no charge was made.
        </div>
      ) : (
        <div className="bg-gray-100 px-5 py-2 text-center text-xs font-medium text-gray-700">
          This order was cancelled.
        </div>
      )}

      <header className="border-b border-gray-100 px-5 py-6">
        <p className="text-sm font-medium" style={{ color: "var(--brand)" }}>
          {eyebrow}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-900">
          Thanks, {order.customerName.split(" ")[0]}!
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {venue.name} · Reference{" "}
          <span className="font-mono text-gray-700">{reference}</span>
        </p>
      </header>

      <section className="grid gap-3 px-5 py-5 text-sm sm:grid-cols-2">
        <div className="rounded-lg border border-gray-200 p-3">
          <p className="text-xs uppercase tracking-wide text-gray-400">Status</p>
          <p className="mt-0.5 font-medium text-gray-900">{statusLabel}</p>
          {isPending ? <PaymentStatusPoller /> : null}
          {isFailed ? (
            <p className="mt-2 text-sm text-gray-600">
              No payment was taken. You can try again from the menu.
            </p>
          ) : null}
        </div>
        <div className="rounded-lg border border-gray-200 p-3">
          <p className="text-xs uppercase tracking-wide text-gray-400">
            {order.orderType === "dine_in" ? "Dine-in" : "Pickup"}
          </p>
          <p className="mt-0.5 font-medium text-gray-900">
            {order.orderType === "dine_in"
              ? `Table ${order.tableLabel ?? "—"}`
              : "Collect at the counter"}
          </p>
        </div>
      </section>

      <section className="px-5 pb-6">
        <h2 className="text-sm font-semibold text-gray-900">Items</h2>
        <ul className="mt-2 divide-y divide-gray-100">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm text-gray-900">
                  <span className="text-gray-500">{item.quantity}×</span>{" "}
                  {item.name}
                  {item.variantName ? ` (${item.variantName})` : ""}
                </p>
                {item.modifiers.length > 0 ? (
                  <p className="mt-0.5 text-xs text-gray-500">
                    {item.modifiers.map((m) => m.name).join(", ")}
                  </p>
                ) : null}
              </div>
              <span className="shrink-0 text-sm text-gray-700">
                ${formatCents(item.lineTotalCents)}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
          <span className="text-sm font-medium text-gray-900">Total</span>
          <span className="text-base font-semibold text-gray-900">
            ${formatCents(order.totalCents)}
          </span>
        </div>
      </section>

      <div className="px-5 pb-10">
        {isFailed ? (
          <Link
            href={`/${venue.slug}`}
            className="inline-block rounded-lg px-4 py-2 text-sm font-semibold text-white transition"
            style={{ backgroundColor: "var(--brand)" }}
          >
            Try again
          </Link>
        ) : (
          <Link
            href={`/${venue.slug}`}
            className="text-sm font-medium underline"
            style={{ color: "var(--brand)" }}
          >
            ← Back to {venue.name}
          </Link>
        )}
      </div>
    </main>
  );
}
