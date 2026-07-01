import { Button } from "@/app/_components/button";
import { PageHeader } from "@/app/_components/page-header";
import { tableDeepLink, tableQrSvg } from "@/lib/qr";
import { requireUser, requireVenue } from "@/lib/tenant";
import { getBaseUrl } from "@/lib/url";

import { deleteTable, moveTable } from "./actions";
import { PrintButton } from "./print-button";
import { getTablesForVenue } from "./queries";
import { TableForm } from "./table-form";

// getBaseUrl() reads request headers and the sheet must always reflect just-
// added tables, so render dynamically (matches the menu/orders dashboards).
export const dynamic = "force-dynamic";

export default async function TablesPage() {
  await requireUser();
  const venue = await requireVenue();

  const [tables, baseUrl] = await Promise.all([
    getTablesForVenue(venue.id),
    getBaseUrl(),
  ]);

  // Build each table's absolute deep-link + QR SVG server-side (getBaseUrl is
  // server-only; SVG prints crisp at any DPI). The link is exactly what the
  // storefront already consumes via ?table=.
  const cells = await Promise.all(
    tables.map(async (table) => {
      const url = tableDeepLink(baseUrl, venue.slug, table.label);
      return { id: table.id, label: table.label, url, svg: await tableQrSvg(url) };
    }),
  );

  return (
    <main className="mx-auto max-w-3xl">
      {/* ---- Manager chrome: never printed (print:hidden) ---- */}
      <div className="print:hidden">
        <PageHeader
          title="Tables"
          description="Name your dine-in tables and print a QR code for each one."
          action={cells.length > 0 ? <PrintButton /> : undefined}
        />

        <section className="px-5 py-6">
          <h2 className="font-mono text-[11px] font-bold uppercase tracking-wider text-label">
            Add a table
          </h2>
          <div className="mt-3">
            <TableForm />
          </div>
        </section>

        <section className="border-t border-line px-5 py-6">
          <h2 className="font-mono text-[11px] font-bold uppercase tracking-wider text-label">
            Your tables{tables.length > 0 ? ` (${tables.length})` : ""}
          </h2>
          {tables.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              No tables yet. Add your first table above.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {tables.map((table, index) => (
                <li
                  key={table.id}
                  className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface-elevated px-3 py-2.5 shadow-card"
                >
                  <div className="flex items-center gap-1">
                    <form action={moveTable}>
                      <input type="hidden" name="id" value={table.id} />
                      <input type="hidden" name="direction" value="up" />
                      <Button
                        type="submit"
                        variant="secondary"
                        size="sm"
                        disabled={index === 0}
                        aria-label={`Move ${table.label} up`}
                      >
                        ↑
                      </Button>
                    </form>
                    <form action={moveTable}>
                      <input type="hidden" name="id" value={table.id} />
                      <input type="hidden" name="direction" value="down" />
                      <Button
                        type="submit"
                        variant="secondary"
                        size="sm"
                        disabled={index === tables.length - 1}
                        aria-label={`Move ${table.label} down`}
                      >
                        ↓
                      </Button>
                    </form>
                  </div>

                  <div className="min-w-0 flex-1">
                    <TableForm table={{ id: table.id, label: table.label }} />
                  </div>

                  <form action={deleteTable}>
                    <input type="hidden" name="id" value={table.id} />
                    <Button type="submit" variant="destructive" size="sm">
                      Delete
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ---- Printable QR sheet (also shown on screen as a preview) ---- */}
      {cells.length > 0 ? (
        <section className="border-t border-line px-5 py-6 print:border-0 print:py-0">
          <h2 className="mb-4 font-mono text-[11px] font-bold uppercase tracking-wider text-label print:hidden">
            Printable sheet preview
          </h2>

          {/* Print-only title so a printed sheet identifies its venue. */}
          <p className="hidden text-center text-lg font-semibold print:mb-4 print:block">
            {venue.name} — scan to order
          </p>

          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 print:grid-cols-3">
            {cells.map((cell) => (
              <div
                key={cell.id}
                className="flex break-inside-avoid flex-col items-center gap-2 rounded-card border border-line p-4 text-center print:border-black"
              >
                <div
                  className="w-full max-w-[200px] [&_svg]:h-auto [&_svg]:w-full"
                  // QR SVG built server-side from a server-constructed URL (no
                  // user markup); qrcode emits deterministic, script-free SVG.
                  dangerouslySetInnerHTML={{ __html: cell.svg }}
                />
                <p className="text-lg font-semibold text-ink print:text-black">
                  {cell.label}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
