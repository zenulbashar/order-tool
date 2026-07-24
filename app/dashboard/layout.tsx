import type { Metadata } from "next";

import {
  getCurrentVenue,
  getImpersonatedVenue,
  getUserVenues,
  requireUser,
} from "@/lib/tenant";

import { exitVenueImpersonation } from "../admin/actions";
import { getActiveOrderCount } from "./orders/queries";
import { PushRegistrar } from "./push-registrar";
import { Sidebar } from "./sidebar";
import { SupportWidget } from "./support-widget";

// Belt-and-braces with robots.txt: Disallow blocks crawling but an externally
// linked URL can still be indexed — noindex closes that gap for the dashboard.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

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
  const [venues, current, impersonating] = await Promise.all([
    getUserVenues(),
    getCurrentVenue(),
    getImpersonatedVenue(),
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
      <main className="min-w-0 flex-1 overflow-y-auto">
        {impersonating ? (
          <div className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-[var(--color-warm)] px-5 py-2 text-sm text-white print:hidden">
            <p className="min-w-0">
              <span className="font-semibold">Viewing as {impersonating.name}</span>
              <span className="text-white/80">
                {" "}
                — admin support session. Changes you make apply to this venue.
              </span>
            </p>
            <form action={exitVenueImpersonation}>
              <button
                type="submit"
                className="rounded-control bg-white/20 px-3 py-1 text-xs font-semibold text-white transition hover:bg-white/30"
              >
                Exit to admin →
              </button>
            </form>
          </div>
        ) : null}
        {children}
      </main>
      {/* Native app only: registers this device for new-order push (no-op on web). */}
      <PushRegistrar />
      {/* Owner AI support chat (docs/ai-support-chat-plan.md) — FAB + panel. */}
      <SupportWidget venueId={current.id} />
    </div>
  );
}
