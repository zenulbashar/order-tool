import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getCustomer } from "@/lib/customer/auth";
import { isReservedSlug } from "@/lib/validation";

import { getPublicVenueBySlug } from "../queries";
import { OrderHistory } from "./order-history";
import { getCustomerOrders, getRecentCustomerOrders } from "./queries";
import { SignInForm } from "./signin-form";

// Reads the customer session + live order history per request; never prerendered.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your orders" };

type AccountParams = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

/**
 * Customer account — OPT-IN and entirely separate from owner auth. Signed out:
 * the email sign-in form. Signed in: this customer's own order history with
 * 1-click reorder. A customer who never visits here sees today's exact ordering
 * flow (guest checkout is untouched).
 */
export default async function AccountPage({
  params,
  searchParams,
}: AccountParams) {
  const { slug } = await params;
  if (isReservedSlug(slug)) notFound();

  const venue = await getPublicVenueBySlug(slug);
  if (!venue) notFound();

  const sp = await searchParams;
  const linkError = sp.error === "link";

  const customer = await getCustomer(venue.id);
  // Both reads are IDOR-safe: venue-scoped AND keyed on the session-derived
  // customer id. recentOrders powers the quick-reorder cards; orders is the
  // full history list below.
  const [recentOrders, orders] = customer
    ? await Promise.all([
        getRecentCustomerOrders(venue.id, customer.id),
        getCustomerOrders(venue.id, customer.id),
      ])
    : [[], []];
  const brandStyle = { "--brand": venue.brandColor } as React.CSSProperties;

  return (
    <main style={brandStyle} className="mx-auto min-h-dvh max-w-2xl bg-white">
      <header className="border-b border-gray-100 px-5 py-5">
        <Link
          href={`/${venue.slug}`}
          className="text-xs text-gray-500 hover:text-gray-900"
        >
          ← Back to {venue.name}
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-gray-900">
          Your orders
        </h1>
        <p className="text-sm text-gray-500">{venue.name}</p>
      </header>

      {customer ? (
        <OrderHistory
          slug={venue.slug}
          customerEmail={customer.email}
          recentOrders={recentOrders}
          orders={orders}
        />
      ) : (
        <SignInForm
          slug={venue.slug}
          venueName={venue.name}
          linkError={linkError}
        />
      )}
    </main>
  );
}
