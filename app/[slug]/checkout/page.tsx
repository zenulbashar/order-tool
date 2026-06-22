import { notFound } from "next/navigation";

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

  const [menu, sp] = await Promise.all([getPublicMenu(venue.id), searchParams]);
  // Carry the storefront's order-type selection; "dinein" (2a) -> "dine_in".
  const initialOrderType = normalizeOrderType(
    typeof sp.type === "string" ? sp.type : undefined,
  );
  const initialTable = typeof sp.table === "string" ? sp.table : "";

  return (
    <CartProvider slug={venue.slug} menu={menu}>
      <CheckoutClient
        venue={venue}
        initialOrderType={initialOrderType}
        initialTable={initialTable}
      />
    </CartProvider>
  );
}
