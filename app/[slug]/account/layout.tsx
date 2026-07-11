import Link from "next/link";
import { notFound } from "next/navigation";

import { readableOn } from "@/app/_components/brand-contrast";
import { getCustomer } from "@/lib/customer/auth";
import { isReservedSlug } from "@/lib/validation";

import { getPublicVenueBySlug } from "../queries";
import { AccountNav } from "./account-nav";

// The account area reads the customer session per request; never prerendered.
export const dynamic = "force-dynamic";

/**
 * Shared chrome for every /account/* route: the diner header + (when signed in)
 * a left nav rail on desktop / a scrollable nav row on mobile, with the page
 * content beside it. Signed out, only the child (the sign-in form on /account)
 * renders — no rail. Each child still resolves its own customer for its data;
 * getCustomer is request-cached so this adds no extra query.
 */
export default async function AccountLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (isReservedSlug(slug)) notFound();

  const venue = await getPublicVenueBySlug(slug);
  if (!venue) notFound();

  const customer = await getCustomer(venue.id);
  const brandStyle = {
    "--brand": venue.brandColor,
    "--brand-contrast": readableOn(venue.brandColor),
  } as React.CSSProperties;

  return (
    <main
      style={brandStyle}
      data-domain="diner"
      className="mx-auto min-h-dvh max-w-2xl bg-surface lg:max-w-[960px]"
    >
      <header className="border-b border-line px-5 py-5">
        <Link
          href={`/${venue.slug}`}
          className="text-xs text-muted hover:text-ink"
        >
          ← Back to {venue.name}
        </Link>
        <h1 className="mt-2 font-display text-xl font-semibold tracking-tight text-ink">
          Your account
        </h1>
        <p className="text-sm text-muted">{venue.name}</p>
      </header>

      {customer ? (
        <div className="lg:grid lg:grid-cols-[210px_1fr] lg:items-start lg:gap-6 lg:px-6 lg:py-6">
          <AccountNav slug={venue.slug} email={customer.email} />
          <div className="min-w-0">{children}</div>
        </div>
      ) : (
        children
      )}
    </main>
  );
}
