import { desc } from "drizzle-orm";

import { PageHeader } from "@/app/_components/page-header";

import { StockNav } from "../stock-chrome";
import { db } from "@/lib/db";
import { invoiceScans } from "@/lib/db/schema";
import { requireUser, requireVenue, scopedToVenue } from "@/lib/tenant";

import { ScanClient, type RecentScan } from "./scan-client";

export const dynamic = "force-dynamic";

const RECENT_LIMIT = 5;

/** "3 Jul" — a compact scanned-on label for the recent-scans list. */
function scannedLabel(date: Date): string {
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

/**
 * Stock · Scan invoice (Track D · D3). The AI vision flow: read a supplier
 * invoice → review each line against the ingredient library → apply pack-cost
 * updates. The ONLY AI surface in Stock, so amber is sanctioned here. No
 * money-path involvement — costs are owner analytics.
 */
export default async function ScanInvoicePage() {
  await requireUser();
  const venue = await requireVenue();

  const rows = await db
    .select()
    .from(invoiceScans)
    .where(scopedToVenue(invoiceScans.venueId, venue.id))
    .orderBy(desc(invoiceScans.createdAt))
    .limit(RECENT_LIMIT);

  const recentScans: RecentScan[] = rows.map((row) => ({
    id: row.id,
    supplier: row.supplier,
    lineCount: row.lineCount,
    updatedCount: row.updatedCount,
    createdCount: row.createdCount,
    scannedLabel: scannedLabel(row.createdAt),
  }));

  return (
    <main className="mx-auto w-full max-w-[1600px]">
      <PageHeader
        title="Scan invoice"
        description={venue.name}
        backHref="/dashboard/stock"
      />

      <div className="max-w-3xl space-y-4 px-5 py-4">
        {/*
          The hub tab bar advertises "Invoices" as a peer tab pointing here, but
          this page rendered without it — so the tabs vanished on arrival.
          Flagged during the design audit as a design call rather than a
          duplication; extracting <StockNav> made it a one-line fix. The page
          keeps its own header and back link, since it is a detail surface
          rather than a fourth hub list.
        */}
        <StockNav current="invoices" />
        <ScanClient recentScans={recentScans} />
      </div>
    </main>
  );
}
