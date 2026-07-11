import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { getCustomer } from "@/lib/customer/auth";
import { isReservedSlug } from "@/lib/validation";

import { getPublicVenueBySlug } from "../../queries";
import { NotifyPrefsForm } from "./notify-prefs-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Notifications" };

/**
 * Order notifications — real, persisted opt-ins for email + SMS updates (order
 * confirmed / ready). Both are transactional (no marketing). Preferences are
 * saved on the customer; sends are best-effort at each order event.
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
      <p className="mt-0.5 text-sm text-muted">
        Get an update when your order is confirmed and when it&rsquo;s ready.
        Transactional only — never marketing.
      </p>
      <div className="mt-4">
        <NotifyPrefsForm
          slug={venue.slug}
          email={customer.email}
          phone={customer.phone}
          notifyOrderEmail={customer.notifyOrderEmail}
          notifyOrderSms={customer.notifyOrderSms}
        />
      </div>
    </section>
  );
}
