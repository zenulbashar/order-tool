import { Card } from "@/app/_components/card";
import { SettingsPane, StorefrontHint } from "../settings-pane";
import { PageHeader } from "@/app/_components/page-header";
import { requireUser, requireVenue } from "@/lib/tenant";

import { LogoControl } from "../logo-control";

export default async function LogoSettingsPage() {
  await requireUser();
  const venue = await requireVenue();

  return (
    <main className="mx-auto w-full max-w-[1600px]">
      <PageHeader
        title="Logo"
        backHref="/dashboard/settings"
        description="Your brand logo — shown in the storefront header and footer. Uploading a logo also sets your brand colour automatically."
      />
      <section className="max-w-[1280px] px-5 py-8">
        <SettingsPane
          aside={<StorefrontHint slug={venue.slug} where="Shown in your storefront header and footer." />}
        >
        <Card>
          <LogoControl logoUrl={venue.logoUrl} />
        </Card>
        </SettingsPane>
      </section>
    </main>
  );
}
