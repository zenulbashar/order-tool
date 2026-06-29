import Link from "next/link";

import { getCurrentVenue, getUserVenues, requireUser } from "@/lib/tenant";

import { VenueSwitcher } from "./venue-switcher";

/**
 * Shared dashboard chrome. The venue switcher lives here so every dashboard page
 * inherits it with no per-page change, and so the owner can always see — and
 * change — which location they are managing.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();
  const [venues, current] = await Promise.all([
    getUserVenues(),
    getCurrentVenue(),
  ]);

  // Before any venue exists the page's own requireVenue() redirects to
  // /onboarding; render nothing extra so we don't flash an empty switcher.
  if (!current) {
    return <>{children}</>;
  }

  const hasMultiple = venues.length > 1;

  return (
    <div>
      {/* print:hidden so dashboard prints (the orders ticket, the tables QR
          sheet) show only page content, never this venue-switcher chrome. */}
      <div className="border-b border-gray-200 bg-white print:hidden">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-gray-400">
              Managing
            </span>
            {hasMultiple ? (
              <VenueSwitcher
                venues={venues.map((venue) => ({
                  id: venue.id,
                  name: venue.name,
                }))}
                currentId={current.id}
              />
            ) : (
              <span className="truncate text-sm font-semibold text-gray-900">
                {current.name}
              </span>
            )}
          </div>
          {hasMultiple ? null : (
            <Link
              href="/onboarding/details"
              className="shrink-0 text-sm font-medium text-gray-500 underline hover:text-gray-900"
            >
              ＋ Add location
            </Link>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
