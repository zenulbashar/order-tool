import type { Metadata } from "next";

import { isReservedSlug } from "@/lib/validation";

import { getPublicVenueBySlug } from "./queries";

/**
 * Diner-subtree metadata: the browser-tab icon is the VENUE's logo, not the
 * Prompt2Eat favicon — the storefront is the venue's branded space. Applies to
 * every diner route (menu, checkout, order, account) via this shared layout;
 * a venue without a logo keeps the platform icon from the root layout.
 * getPublicVenueBySlug is request-cached, so this adds no extra query. The
 * layout renders no chrome — each diner page owns its own shell.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (isReservedSlug(slug)) return {};
  const venue = await getPublicVenueBySlug(slug);
  if (!venue?.logoUrl) return {};
  return { icons: { icon: venue.logoUrl } };
}

export default function DinerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
