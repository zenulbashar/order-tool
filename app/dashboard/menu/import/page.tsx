import { PageHeader } from "@/app/_components/page-header";
import { requireUser, requireVenue } from "@/lib/tenant";

import { ImportClient } from "./import-client";

export default async function ImportMenuPage() {
  await requireUser();
  const venue = await requireVenue();

  return (
    <main className="mx-auto w-full max-w-[1600px]">
      <PageHeader
        title="Import menu from photo"
        description={venue.name}
        backHref="/dashboard/menu"
      />

      <div className="max-w-3xl px-5">
        <ImportClient />
      </div>
    </main>
  );
}
