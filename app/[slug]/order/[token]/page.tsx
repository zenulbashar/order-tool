import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { formatCents, isReservedSlug } from "@/lib/validation";

import { getPublicVenueBySlug } from "../../queries";
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
  const reference = order.publicToken.slice(0, 8).toUpperCase();

  return (
    <main style={brandStyle} className="mx-auto min-h-dvh max-w-2xl bg-white">
      {/* STUB visibility: no real payment is taken this phase, so make the
          stubbed state unmistakable — never let it read as a paid order. */}
      <div className="bg-amber-100 px-5 py-2 text-center text-xs font-medium text-amber-800">
        Test order — no payment was taken. Online payment is coming soon.
      </div>

      <header className="border-b border-gray-100 px-5 py-6">
        <p className="text-sm font-medium" style={{ color: "var(--brand)" }}>
          Order received
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
          <p className="mt-0.5 font-medium text-gray-900">
            {order.status === "confirmed"
              ? "Confirmed (unpaid)"
              : order.status === "pending_payment"
                ? "Pending payment"
                : "Cancelled"}
          </p>
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
        <Link
          href={`/${venue.slug}`}
          className="text-sm font-medium underline"
          style={{ color: "var(--brand)" }}
        >
          ← Back to {venue.name}
        </Link>
      </div>
    </main>
  );
}
