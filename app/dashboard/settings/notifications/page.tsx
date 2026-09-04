import { Card } from "@/app/_components/card";
import { PageHeader } from "@/app/_components/page-header";
import { requireUser, requireVenuePermission } from "@/lib/tenant";
import { vapidPublicKey } from "@/lib/web-push";

import { EnablePushButton } from "../enable-push-button";
import { NotifyToggle } from "../notify-toggle";

export default async function NotificationsSettingsPage() {
  await requireUser();
  const venue = await requireVenuePermission("settings:manage");
  const webPushKey = vapidPublicKey();

  return (
    <main className="mx-auto w-full max-w-[1600px]">
      <PageHeader
        title="Order notifications"
        backHref="/dashboard/settings"
        description="Get a push notification on your phone the moment a new order comes in — from this browser, the installed web app, or the Prompt2Eat app."
      />
      <section className="max-w-3xl px-5 py-8">
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
        {webPushKey ? (
          <Card className="mt-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-ink">This device</p>
                <p className="text-xs text-muted">
                  Turn on browser notifications here so this phone or laptop
                  gets new orders without the app. Repeat on each device.
                </p>
              </div>
              <EnablePushButton vapidPublicKey={webPushKey} />
            </div>
          </Card>
        ) : null}
      </section>
    </main>
  );
}
