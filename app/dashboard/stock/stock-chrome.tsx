import Link from "next/link";

import { PageHeader } from "@/app/_components/page-header";

/**
 * Shared chrome for the Stock hub tabs (audit D4).
 *
 * The header and tab bar were byte-identical across stock/, stock/overview/ and
 * stock/suggestions/ — 12 copy-pasted class literals differing only in which tab
 * was the active <span>. That is the drift D4 describes: the copies are correct
 * today because nobody has edited one of them yet.
 *
 * Presentational and hook-free, so the three server pages keep rendering on the
 * server. Emits the same markup the copies did — this is a deduplication, not a
 * restyle.
 */

export type StockTab = "overview" | "ingredients" | "invoices" | "suggestions";

const TABS: { key: StockTab; label: string; href: string }[] = [
  { key: "overview", label: "Overview", href: "/dashboard/stock/overview" },
  { key: "ingredients", label: "Ingredients", href: "/dashboard/stock" },
  { key: "invoices", label: "Invoices", href: "/dashboard/stock/scan" },
  { key: "suggestions", label: "Suggestions", href: "/dashboard/stock/suggestions" },
];

const tabBase = "rounded-[7px] px-3 py-1.5 text-xs";
const tabIdle = `${tabBase} font-semibold text-label transition hover:text-ink`;
const tabActive = `${tabBase} bg-surface-elevated font-bold text-ink shadow-sm`;

/**
 * Stock hub header. The "✦ Scan invoice" CTA is amber on purpose: it navigates
 * INTO /dashboard/stock/scan, the AI vision surface, and the design firewall
 * reserves amber for exactly that. (An earlier audit pass read these as
 * violations by looking at the page each link sits on rather than where it goes.)
 */
export function StockHeader({ venueName }: { venueName: string }) {
  return (
    <PageHeader
      title="Stock"
      description={venueName}
      action={
        <Link
          href="/dashboard/stock/scan"
          className="inline-flex items-center gap-1.5 rounded-control bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-forest transition hover:opacity-90"
        >
          <span aria-hidden="true">✦</span> Scan invoice
        </Link>
      }
    />
  );
}

/**
 * Stock hub tab bar. The current tab renders as a <span>, not a link to the page
 * you are already on — which is what the copies did, and is the right call for
 * both pointer and screen-reader users.
 */
export function StockNav({ current }: { current: StockTab }) {
  return (
    <div className="inline-flex gap-1 rounded-[10px] bg-sand p-1">
      {TABS.map((tab) =>
        tab.key === current ? (
          <span key={tab.key} className={tabActive}>
            {tab.label}
          </span>
        ) : (
          <Link key={tab.key} href={tab.href} className={tabIdle}>
            {tab.label}
          </Link>
        ),
      )}
    </div>
  );
}
