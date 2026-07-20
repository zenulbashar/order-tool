import Link from "next/link";

import { Card } from "@/app/_components/card";
import { PageHeader } from "@/app/_components/page-header";
import { requireUser, requireVenue } from "@/lib/tenant";

/**
 * Storefront settings hub. The settings that used to live on one long page are
 * now focused sub-pages (each reachable from the sidebar's "Storefront setup"
 * dropdown too); this hub links to all of them so there's a single home for the
 * section and an in-page path to each.
 */
const SECTIONS: { href: string; title: string; description: string }[] = [
  {
    href: "/dashboard/settings/brand",
    title: "Brand & colours",
    description: "Your accent and text colours.",
  },
  {
    href: "/dashboard/settings/logo",
    title: "Logo",
    description: "The logo shown in your storefront header and footer.",
  },
  {
    href: "/dashboard/settings/imagery",
    title: "Photos & hero",
    description: "Up to three rotating hero photos.",
  },
  {
    href: "/dashboard/settings/announcement",
    title: "Announcement bar",
    description: "A slim promo message across the top.",
  },
  {
    href: "/dashboard/settings/social",
    title: "Social links",
    description: "“Follow us” links in your footer.",
  },
  {
    href: "/dashboard/settings/about",
    title: "About & description",
    description: "A short welcome line under your name.",
  },
  {
    href: "/dashboard/settings/hours",
    title: "Opening hours & location",
    description: "Address, phone, hours and pickup scheduling.",
  },
  {
    href: "/dashboard/settings/tax",
    title: "Tax (GST)",
    description: "Show the GST portion on receipts.",
  },
  {
    href: "/dashboard/settings/stations",
    title: "Prep stations",
    description: "Per-station kitchen labels & the packaging docket.",
  },
  {
    href: "/dashboard/settings/notifications",
    title: "Order notifications",
    description: "New-order push alerts on your phone.",
  },
];

export default async function SettingsPage() {
  await requireUser();
  const venue = await requireVenue();

  return (
    <main className="mx-auto max-w-3xl">
      <PageHeader title="Storefront settings" description={venue.name} />

      <section className="px-5 py-8">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map((section) => (
            <Link key={section.href} href={section.href} className="group block">
              <Card className="h-full transition group-hover:border-muted/50 group-hover:shadow-lift">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-display text-base font-semibold tracking-tight text-ink">
                      {section.title}
                    </p>
                    <p className="mt-0.5 text-sm text-muted">
                      {section.description}
                    </p>
                  </div>
                  <span
                    aria-hidden="true"
                    className="shrink-0 text-muted transition group-hover:translate-x-0.5"
                  >
                    →
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>

        <p className="mt-6 text-xs text-muted">
          Your storefront is live at{" "}
          <Link
            href={`/${venue.slug}`}
            className="font-medium text-[var(--action)] underline hover:opacity-80"
            target="_blank"
          >
            /{venue.slug}
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
