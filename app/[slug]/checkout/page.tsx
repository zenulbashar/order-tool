import { notFound } from "next/navigation";

import { getCustomer } from "@/lib/customer/auth";
import { readCustomerPrefill } from "@/lib/customer/prefill";
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

  // A venue that has not finished onboarding is not live (Phase 3c). Show a
  // graceful notice instead of the checkout form; placeOrder is the authoritative
  // server-side block. Live venues skip this entirely (today's exact behaviour).
  if (!venue.isLive) {
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

  return (
    <CartProvider slug={venue.slug} menu={menu}>
      <CheckoutClient
        venue={venue}
        initialOrderType={initialOrderType}
        initialTable={initialTable}
        initialName={prefill.name}
        initialEmail={customer?.email ?? ""}
        initialPhone={prefill.phone}
        nowMs={requestNowMs()}
      />
    </CartProvider>
  );
}
