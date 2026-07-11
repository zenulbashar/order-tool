import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { getCustomer } from "@/lib/customer/auth";
import { isReservedSlug } from "@/lib/validation";

import { getPublicVenueBySlug } from "../../queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Saved payment" };

/**
 * Honest "Saved payment" page. Prompt2Eat charges per order at checkout (Stripe /
 * PayTo) and does NOT vault customer cards — so there is genuinely nothing stored
 * to manage here. We state that plainly rather than showing an empty card list
 * or a non-functional "add card" affordance.
 */
export default async function AccountPaymentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (isReservedSlug(slug)) notFound();
  const venue = await getPublicVenueBySlug(slug);
  if (!venue) notFound();

  const customer = await getCustomer(venue.id);
  if (!customer) redirect(`/${slug}/account`);

  return (
    <section className="px-5 pb-10 pt-2 lg:px-0 lg:pt-0">
      <h2 className="font-display text-lg font-semibold tracking-tight text-ink">
        Saved payment
      </h2>
      <div className="mt-4 max-w-md rounded-card border border-line bg-surface-elevated p-4 shadow-card">
        <p className="text-sm font-semibold text-ink">No card stored</p>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          You don&rsquo;t need to save a card. Each order is paid securely at
          checkout with Stripe — or by bank transfer (PayTo) where {venue.name}{" "}
          offers it. Your card details are never seen or stored by the venue, and
          nothing is charged until you place an order.
        </p>
      </div>
    </section>
  );
}
