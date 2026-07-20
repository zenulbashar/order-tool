import { tableDeepLink, tableQrSvg } from "@/lib/qr";
import { requireUser, requireVenue } from "@/lib/tenant";
import { getBaseUrl } from "@/lib/url";

import { getTablesWithStatus } from "./queries";
import { TablesBoard } from "./tables-board";

// getBaseUrl() reads request headers, statuses are live, and the sheet must
// reflect just-added tables — render dynamically (matches the other dashboards).
export const dynamic = "force-dynamic";

export default async function TablesPage() {
  await requireUser();
  const venue = await requireVenue();

  const [tables, baseUrl] = await Promise.all([
    getTablesWithStatus(venue.id),
    getBaseUrl(),
  ]);

  // Build each table's absolute deep-link + QR SVG server-side (getBaseUrl is
  // server-only; SVG prints crisp at any DPI). The link is exactly what the
  // storefront already consumes via ?table=.
  const boardTables = await Promise.all(
    tables.map(async (table) => ({
      id: table.id,
      label: table.label,
      seats: table.seats,
      status: table.status,
      session: table.session,
      svg: await tableQrSvg(tableDeepLink(baseUrl, venue.slug, table.label)),
    })),
  );

  return (
    <main className="mx-auto w-full max-w-[1600px]">
      <TablesBoard
        tables={boardTables}
        venueName={venue.name}
        logoUrl={venue.logoUrl}
        brandColor={venue.brandColor}
      />
    </main>
  );
}
