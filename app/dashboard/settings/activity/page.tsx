import { PageHeader } from "@/app/_components/page-header";
import {
  AUDIT_ACTION_LABEL,
  getVenueAuditLog,
  type VenueAuditAction,
} from "@/lib/audit";
import { formatVenueTime } from "@/lib/time";
import { requireUser, requireVenuePermission } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/**
 * Venue activity log (M8 / audit F9). The merchant-visible half of the
 * finding: `platform_audit_log` recorded admin-console actions well, but
 * nothing showed a venue what its own people changed.
 *
 * Gated on `settings:manage` — a log of who changed what is management
 * information, not something every kitchen login should browse. Rows are
 * venue-scoped in the query, so platform-wide admin entries (NULL venue_id)
 * can never appear here.
 */
export default async function ActivitySettingsPage() {
  await requireUser();
  const venue = await requireVenuePermission("settings:manage");
  const entries = await getVenueAuditLog(venue.id, 100);

  return (
    <main className="mx-auto w-full max-w-[1600px]">
      <PageHeader
        title="Activity"
        backHref="/dashboard/settings"
        description="Who changed what, most recent first."
      />
      <section className="max-w-[900px] px-5 py-8">
        {entries.length === 0 ? (
          <p className="rounded-card border border-line bg-surface p-5 text-base text-muted">
            Nothing recorded yet. Menu edits, price changes, opening hours,
            order status changes, refunds, gift cards and staff changes will
            appear here.
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-card border border-line bg-surface">
            {entries.map((entry) => (
              <li key={entry.id} className="flex flex-wrap gap-x-4 gap-y-1 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">
                    {AUDIT_ACTION_LABEL[entry.action as VenueAuditAction] ??
                      entry.action}
                  </p>
                  {entry.detail ? (
                    <p className="mt-0.5 break-words text-sm text-muted">
                      {entry.detail}
                    </p>
                  ) : null}
                </div>
                <div className="text-sm text-muted">
                  <p>{entry.actorEmail}</p>
                  <p>{formatVenueTime(entry.createdAt, venue.timezone)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
