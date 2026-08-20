import { notFound } from "next/navigation";

import { getCustomer } from "@/lib/customer/auth";
import { readCustomerPrefill } from "@/lib/customer/prefill";
import { getPointsBalance } from "@/lib/loyalty/balance";
import { requestNowMs } from "@/lib/schedule";
import { isReservedSlug, normalizeOrderType } from "@/lib/validation";

import { CartProvider } from "../cart-provider";
import { getPublicMenu, getPublicVenueBySlug } from "../queries";
import { CheckoutClient } from "./checkout-client";

// Reads live menu + the persisted cart at request time; never prerendered.
export const dynamic = "force-dynamic";

type CheckoutParams = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function CheckoutPage({
  params,
  searchParams,
}: CheckoutParams) {
  const { slug } = await params;
  if (isReservedSlug(slug)) notFound();

  const venue = await getPublicVenueBySlug(slug);
  if (!venue) notFound();

  // A venue that cannot complete an order — onboarding unfinished, OR live but
  // with no Stripe account connected — gets a graceful notice instead of the
  // form. It used to check isLive alone, so an owner who finished the wizard
  // (which never connects Stripe) sent every diner through cart, name, email
  // and phone to reach "This venue isn't accepting online payments yet" on the
  // final tap.
  //
  // placeOrder's reject stays exactly where it is and is the authoritative
  // block: it fails closed BEFORE any item fetch, price recompute, transaction
  // or PaymentIntent. This gate is the courtesy, not the control — do not
  // "dedupe" the two.
  if (!venue.acceptsOrders) {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center">
        <h1 className="font-display text-xl font-semibold tracking-tight text-ink">
          {venue.name}{" "}isn&apos;t taking orders yet
        </h1>
        <p className="mt-2 text-sm text-muted">
          This venue is still setting up. Please check back soon.
        </p>
      </main>
    );
  }

  const [menu, sp, customer] = await Promise.all([
    getPublicMenu(venue.id),
    searchParams,
    getCustomer(venue.id),
  ]);
  // Carry the storefront's order-type selection; "dinein" (2a) -> "dine_in".
  const initialOrderType = normalizeOrderType(
    typeof sp.type === "string" ? sp.type : undefined,
  );
  const initialTable = typeof sp.table === "string" ? sp.table : "";

  // Name/phone pre-fill DEFAULTS for the form (still fully editable; the server
  // re-validates everything on placeOrder regardless). PRECEDENCE: a signed-in
  // customer's account record (session-derived) wins; otherwise fall back to the
  // device "remember me" cookie (name+phone only, no identity). Guests with
  // neither get empty fields — today's exact behaviour.
  const prefill = customer
    ? { name: customer.name ?? "", phone: customer.phone ?? "" }
    : ((await readCustomerPrefill()) ?? { name: "", phone: "" });

  // Loyalty balance for the redeem-at-checkout control (0 unless the venue runs
  // loyalty AND the diner is signed in — guests can't redeem). Display only; the
  // redeemable amount is always server-recomputed at pay time.
  const pointsBalance =
    customer && venue.loyaltyEnabled
      ? await getPointsBalance(venue.id, customer.id)
      : 0;

  return (
    <CartProvider slug={venue.slug} menu={menu}>
      <CheckoutClient
        venue={venue}
        initialOrderType={initialOrderType}
        initialTable={initialTable}
        initialName={prefill.name}
        initialEmail={customer?.email ?? ""}
        initialPhone={prefill.phone}
        pointsBalance={pointsBalance}
        nowMs={requestNowMs()}
      />
    </CartProvider>
  );
}
