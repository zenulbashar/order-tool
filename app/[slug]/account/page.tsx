import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getCustomer } from "@/lib/customer/auth";
import { getPointsActivity, getPointsBalance } from "@/lib/loyalty/balance";
import { isReservedSlug } from "@/lib/validation";

import { getPublicVenueBySlug } from "../queries";
import { OrderHistory } from "./order-history";
import { PointsPanel } from "./points-panel";
import { getCustomerOrders, getCustomerUsual } from "./queries";
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
  // customer id. usual powers the "YOUR USUAL" hero (null when nothing
  // repeats); orders is the full history list below.
  const [usual, orders] = customer
    ? await Promise.all([
        getCustomerUsual(venue.id, customer.id),
        getCustomerOrders(venue.id, customer.id),
      ])
    : [null, []];

  // Loyalty balance + recent activity — only when the venue runs loyalty AND
  // the customer is signed in (guests never earn). Same IDOR-safe scoping.
  const points =
    customer && venue.loyaltyEnabled
      ? await Promise.all([
          getPointsBalance(venue.id, customer.id),
          getPointsActivity(venue.id, customer.id),
        ])
      : null;

  // The shared account layout (layout.tsx) provides the diner chrome + nav rail;
  // this page renders only the Orders content (signed in) or the sign-in form.
  return customer ? (
    <>
      {points ? (
        <PointsPanel
          balance={points[0]}
          redeemValueCents={venue.loyaltyRedeemValueCents}
          activity={points[1]}
        />
      ) : null}
      <OrderHistory slug={venue.slug} usual={usual} orders={orders} />
    </>
  ) : (
    <SignInForm slug={venue.slug} venueName={venue.name} linkError={linkError} />
  );
}
