import { getCurrentVenue, getUserVenues, requireUser } from "@/lib/tenant";

import { getActiveOrderCount } from "./orders/queries";
import { Sidebar } from "./sidebar";

/**
 * Shared dashboard chrome: a persistent forest-dark sidebar (nav + venue
 * switcher + sign-out) on desktop, a hamburger-drawer on mobile. Every dashboard
 * page renders in the cream content column beside it.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
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

  // Active-order count for the sidebar badge. router.refresh() re-runs the whole
  // route (layouts included), so this stays current on the 12s orders poll and
  // refreshes on navigation elsewhere.
  const activeOrderCount = await getActiveOrderCount(current.id);

  return (
    <div className="lg:flex lg:h-dvh">
      <Sidebar
        venues={venues.map((venue) => ({ id: venue.id, name: venue.name }))}
        currentId={current.id}
        currentName={current.name}
        currentSlug={current.slug}
        plan={current.plan}
        userName={user.name ?? null}
        userEmail={user.email ?? null}
        hasMultiple={hasMultiple}
        activeOrderCount={activeOrderCount}
        brandColor={current.brandColor}
      />
      <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
