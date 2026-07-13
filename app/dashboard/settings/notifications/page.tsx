import { Card } from "@/app/_components/card";
import { PageHeader } from "@/app/_components/page-header";
import { requireUser, requireVenue } from "@/lib/tenant";

import { NotifyToggle } from "../notify-toggle";

export default async function NotificationsSettingsPage() {
  await requireUser();
  const venue = await requireVenue();

  return (
    <main className="mx-auto max-w-3xl">
      <PageHeader
        title="Order notifications"
        backHref="/dashboard/settings"
        description="Get a push notification on your phone the moment a new order comes in (needs the Prompt2Eat app installed and signed in)."
      />
      <section className="px-5 py-8">
        <Card>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-ink">
                New-order notifications
              </p>
              <p className="text-xs text-muted">
                Sent to every device signed in to this venue.
              </p>
            </div>
            <NotifyToggle enabled={venue.pushNewOrders} />
          </div>
        </Card>
      </section>
    </main>
  );
}
