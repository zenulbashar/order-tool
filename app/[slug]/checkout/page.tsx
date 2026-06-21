import Link from "next/link";
import { notFound } from "next/navigation";

import { isReservedSlug } from "@/lib/validation";

import { getPublicVenueBySlug } from "../queries";

// Placeholder destination for "Continue to checkout". Order placement and
// payment land in Phase 2b; nothing is submitted here.
export const dynamic = "force-dynamic";

type CheckoutParams = { params: Promise<{ slug: string }> };

export default async function CheckoutPlaceholder({ params }: CheckoutParams) {
  const { slug } = await params;
  if (isReservedSlug(slug)) notFound();

  const venue = await getPublicVenueBySlug(slug);
  if (!venue) notFound();

  const brandStyle = { "--brand": venue.brandColor } as React.CSSProperties;

  return (
    <main
      style={brandStyle}
      className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center px-6 text-center"
    >
      <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
        Checkout
      </h1>
      <p className="mt-2 max-w-sm text-sm text-gray-500">
        Online checkout isn’t available yet — it arrives in the next update.
        Your cart is saved on this device in the meantime.
      </p>
      <Link
        href={`/${venue.slug}`}
        className="mt-6 text-sm font-medium underline"
        style={{ color: "var(--brand)" }}
      >
        ← Back to {venue.name}
      </Link>
    </main>
  );
}
