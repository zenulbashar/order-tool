import { Card } from "@/app/_components/card";
import { PageHeader } from "@/app/_components/page-header";
import { requireUser, requireVenue } from "@/lib/tenant";

import { ImageryControl } from "../imagery-control";

export default async function ImagerySettingsPage() {
  await requireUser();
  const venue = await requireVenue();

  return (
    <main className="mx-auto max-w-3xl">
      <PageHeader
        title="Photos & hero"
        backHref="/dashboard/settings"
        description="Up to three hero photos. On desktop they fill the top of your storefront and rotate; on mobile the first one is the banner. Wide, landscape shots work best. JPEG, PNG or WebP, up to 5MB each."
      />
      <section className="px-5 py-8">
        <Card>
          <div className="space-y-6">
            <ImageryControl
              slot="cover"
              title="Hero image 1"
              description="The lead image — also the mobile banner."
              imageUrl={venue.coverUrl}
            />
            <div className="border-t border-line pt-6">
              <ImageryControl
                slot="cover2"
                title="Hero image 2"
                description="Optional — joins the rotation on desktop."
                imageUrl={venue.coverUrl2}
              />
            </div>
            <div className="border-t border-line pt-6">
              <ImageryControl
                slot="cover3"
                title="Hero image 3"
                description="Optional — joins the rotation on desktop."
                imageUrl={venue.coverUrl3}
              />
            </div>
          </div>
        </Card>
      </section>
    </main>
  );
}
