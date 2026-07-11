import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { getCustomer } from "@/lib/customer/auth";
import { isReservedSlug } from "@/lib/validation";

import { getPublicVenueBySlug } from "../../queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Notifications" };

/**
 * Honest "Notifications" page. Order receipts are transactional emails to the
 * customer's verified address, and live order status shows on the order page —
 * there are no marketing sends and no stored preference to toggle, so we state
 * the actual behaviour rather than a non-functional switch.
 */
export default async function AccountNotificationsPage({
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
        Notifications
      </h2>
      <div className="mt-4 max-w-md space-y-3">
        <div className="rounded-card border border-line bg-surface-elevated p-4 shadow-card">
          <p className="text-sm font-semibold text-ink">Order receipts</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Your confirmation and receipt for each order are emailed to{" "}
            <span className="font-medium text-ink">{customer.email}</span>.
          </p>
        </div>
        <div className="rounded-card border border-line bg-surface-elevated p-4 shadow-card">
          <p className="text-sm font-semibold text-ink">Live order status</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            After you order, the order page updates as {venue.name} prepares it —
            no marketing emails, ever.
          </p>
        </div>
      </div>
    </section>
  );
}
