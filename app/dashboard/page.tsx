import Link from "next/link";

import { signOut } from "@/lib/auth";
import { isOnboardingComplete, requireUser, requireVenue } from "@/lib/tenant";

export default async function DashboardPage() {
  const user = await requireUser();
  const venue = await requireVenue();
  // Nudge (not a lockout): until onboarding is finished, surface a one-click
  // path back into the wizard. The hard go-live block is added in 3c.
  const needsOnboarding = !isOnboardingComplete(venue);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      {needsOnboarding ? (
        <Link
          href="/onboarding"
          className="mb-6 flex items-center justify-between gap-3 rounded-lg border border-sand bg-surface-elevated px-4 py-3 transition hover:border-brand"
        >
          <span className="text-sm text-ink">
            Finish setting up your venue to go live and take orders.
          </span>
          <span className="shrink-0 text-sm font-medium text-brand">
            Finish setup →
          </span>
        </Link>
      ) : null}
      <header className="flex items-start justify-between gap-4 border-b border-gray-200 pb-6">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-gray-500">Venue</p>
          <h1 className="text-2xl font-semibold tracking-tight">{venue.name}</h1>
          <p className="text-sm text-gray-500">
            /{venue.slug} · {venue.timezone}
          </p>
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/signin" });
          }}
        >
          <button
            type="submit"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Sign out
          </button>
        </form>
      </header>

      <section className="py-10">
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/dashboard/menu"
            className="block rounded-lg border border-gray-200 p-6 transition hover:border-gray-300 hover:bg-gray-50"
          >
            <p className="text-sm font-medium text-gray-900">Menu</p>
            <p className="mt-1 text-sm text-gray-500">
              Manage categories, items, and modifiers for your venue.
            </p>
          </Link>
          <Link
            href="/dashboard/tables"
            className="block rounded-lg border border-gray-200 p-6 transition hover:border-gray-300 hover:bg-gray-50"
          >
            <p className="text-sm font-medium text-gray-900">Tables</p>
            <p className="mt-1 text-sm text-gray-500">
              Name your dine-in tables and print a QR code for each one.
            </p>
          </Link>
          <Link
            href="/dashboard/settings"
            className="block rounded-lg border border-gray-200 p-6 transition hover:border-gray-300 hover:bg-gray-50"
          >
            <p className="text-sm font-medium text-gray-900">
              Storefront settings
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Brand colour, logo, and the description customers see.
            </p>
          </Link>
          <Link
            href="/dashboard/payments"
            className="block rounded-lg border border-gray-200 p-6 transition hover:border-gray-300 hover:bg-gray-50"
          >
            <p className="text-sm font-medium text-gray-900">Payments</p>
            <p className="mt-1 text-sm text-gray-500">
              Connect Stripe to accept online payments for your orders.
            </p>
          </Link>
          <Link
            href="/dashboard/orders"
            className="block rounded-lg border border-gray-200 p-6 transition hover:border-gray-300 hover:bg-gray-50"
          >
            <p className="text-sm font-medium text-gray-900">Orders</p>
            <p className="mt-1 text-sm text-gray-500">
              Watch incoming paid orders and move them through the kitchen.
            </p>
          </Link>
          <Link
            href="/dashboard/billing"
            className="block rounded-lg border border-gray-200 p-6 transition hover:border-gray-300 hover:bg-gray-50"
          >
            <p className="text-sm font-medium text-gray-900">Billing</p>
            <p className="mt-1 text-sm text-gray-500">
              Manage your plan and subscription for this venue.
            </p>
          </Link>
        </div>

        <p className="mt-6 text-sm">
          <Link
            href={`/${venue.slug}`}
            target="_blank"
            className="font-medium text-gray-700 underline hover:text-gray-900"
          >
            View your storefront ↗
          </Link>
        </p>
        <p className="mt-6 text-xs text-gray-400">Signed in as {user.email}</p>
      </section>
    </main>
  );
}
