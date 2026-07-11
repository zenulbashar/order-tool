import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { getCustomer } from "@/lib/customer/auth";
import { isReservedSlug } from "@/lib/validation";

import { getPublicVenueBySlug } from "../../queries";
import { AccountDetailsForm } from "./details-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your details" };

export default async function AccountDetailsPage({
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
        Your details
      </h2>
      <p className="mt-0.5 text-sm text-muted">
        Saved for faster checkout at {venue.name}.
      </p>
      <div className="mt-4 max-w-md">
        <AccountDetailsForm
          slug={venue.slug}
          email={customer.email}
          name={customer.name}
          phone={customer.phone}
        />
      </div>
    </section>
  );
}
