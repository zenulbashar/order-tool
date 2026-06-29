import Link from "next/link";

import { cardStyles } from "@/app/_components/card";
import { PageHeader } from "@/app/_components/page-header";
import { isOnboardingComplete, requireUser, requireVenue } from "@/lib/tenant";

const TILES = [
  {
    href: "/dashboard/menu",
    title: "Menu",
    description: "Manage categories, items, and modifiers for your venue.",
  },
  {
    href: "/dashboard/tables",
    title: "Tables",
    description: "Name your dine-in tables and print a QR code for each one.",
  },
  {
    href: "/dashboard/settings",
    title: "Storefront settings",
    description: "Brand colour, logo, and the description customers see.",
  },
  {
    href: "/dashboard/payments",
    title: "Payments",
    description: "Connect Stripe to accept online payments for your orders.",
  },
  {
    href: "/dashboard/orders",
    title: "Orders",
    description: "Watch incoming paid orders and move them through the kitchen.",
  },
  {
    href: "/dashboard/billing",
    title: "Billing",
    description: "Manage your plan and subscription for this venue.",
  },
];

export default async function DashboardPage() {
  const user = await requireUser();
  const venue = await requireVenue();
  // Nudge (not a lockout): until onboarding is finished, surface a one-click
  // path back into the wizard. The hard go-live block is added in 3c.
  const needsOnboarding = !isOnboardingComplete(venue);

  return (
    <main className="mx-auto max-w-3xl">
      <PageHeader title="Dashboard" description={venue.name} />

      <section className="space-y-6 px-5 py-8">
        {needsOnboarding ? (
          <Link
            href="/onboarding"
            className="flex items-center justify-between gap-3 rounded-card border border-sand bg-surface-elevated px-4 py-3 transition hover:border-forest"
          >
            <span className="text-sm text-ink">
              Finish setting up your venue to go live and take orders.
            </span>
            <span className="shrink-0 text-sm font-medium text-forest">
              Finish setup →
            </span>
          </Link>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          {TILES.map((tile) => (
            <Link
              key={tile.href}
              href={tile.href}
              className={cardStyles({ interactive: true })}
            >
              <p className="text-sm font-medium text-ink">{tile.title}</p>
              <p className="mt-1 text-sm text-muted">{tile.description}</p>
            </Link>
          ))}
        </div>

        <div className="space-y-2">
          <p className="text-sm">
            <Link
              href={`/${venue.slug}`}
              target="_blank"
              className="font-medium text-[var(--action)] underline hover:opacity-80"
            >
              View your storefront ↗
            </Link>
          </p>
          <p className="text-xs text-muted">Signed in as {user.email}</p>
        </div>
      </section>
    </main>
  );
}
