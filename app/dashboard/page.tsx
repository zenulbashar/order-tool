import Link from "next/link";

import { cardStyles } from "@/app/_components/card";
import { PageHeader } from "@/app/_components/page-header";
import { isOnboardingComplete, requireUser, requireVenue } from "@/lib/tenant";

// The hour (0–23) at `now` in the venue's timezone — NOT server-local (Vercel
// runs UTC) and NOT the browser (this is server-rendered). h23 cycle guarantees
// 00–23; a malformed IANA zone falls back to UTC rather than throwing, mirroring
// formatVenueTime in @/lib/time.
function venueHour(now: Date, timeZone: string): number {
  const read = (tz: string) =>
    Number(
      new Intl.DateTimeFormat("en-US", {
        hour: "2-digit",
        hourCycle: "h23",
        timeZone: tz,
      }).format(now),
    );
  try {
    return read(timeZone);
  } catch {
    return read("UTC");
  }
}

// "Saturday, 28 June" in the venue timezone (UTC fallback on a bad zone).
function venueDate(now: Date, timeZone: string): string {
  const options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    day: "numeric",
    month: "long",
  };
  try {
    return new Intl.DateTimeFormat("en-AU", { ...options, timeZone }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-AU", { ...options, timeZone: "UTC" }).format(now);
  }
}

function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

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

  // Time-of-day greeting in the venue's wall-clock time. firstName is the first
  // token of the owner's name; if there's no name, we drop it and just greet.
  const now = new Date();
  const greeting = greetingFor(venueHour(now, venue.timezone));
  const firstName = user.name?.trim().split(/\s+/)[0] ?? "";
  const title = firstName ? `${greeting}, ${firstName}` : greeting;

  return (
    <main className="mx-auto max-w-3xl">
      <PageHeader
        title={title}
        description={`${venue.name} · ${venueDate(now, venue.timezone)}`}
      />

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
