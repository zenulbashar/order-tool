import Link from "next/link";

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

const moveButtonClass =
  "rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40";

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
    <main className="mx-auto max-w-3xl px-6 py-10">
      {/* ---- Manager chrome: never printed (print:hidden) ---- */}
      <div className="print:hidden">
        <header className="flex items-start justify-between gap-4 border-b border-gray-200 pb-6">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-gray-500">
              Dine-in
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">Tables</h1>
            <p className="max-w-prose text-sm text-gray-500">
              Name your tables, then print the QR sheet. Each code opens your
              storefront with dine-in and that table already filled in.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/dashboard"
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              ← Back
            </Link>
            {cells.length > 0 ? <PrintButton /> : null}
          </div>
        </header>

        <section className="py-6">
          <h2 className="text-sm font-medium text-gray-900">Add a table</h2>
          <div className="mt-3">
            <TableForm />
          </div>
        </section>

        <section className="border-t border-gray-100 py-6">
          <h2 className="text-sm font-medium text-gray-900">
            Your tables{tables.length > 0 ? ` (${tables.length})` : ""}
          </h2>
          {tables.length === 0 ? (
            <p className="mt-3 text-sm text-gray-500">
              No tables yet. Add your first table above.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-gray-100">
              {tables.map((table, index) => (
                <li
                  key={table.id}
                  className="flex flex-wrap items-center gap-3 py-3"
                >
                  <div className="flex items-center gap-1">
                    <form action={moveTable}>
                      <input type="hidden" name="id" value={table.id} />
                      <input type="hidden" name="direction" value="up" />
                      <button
                        type="submit"
                        className={moveButtonClass}
                        disabled={index === 0}
                        aria-label={`Move ${table.label} up`}
                      >
                        ↑
                      </button>
                    </form>
                    <form action={moveTable}>
                      <input type="hidden" name="id" value={table.id} />
                      <input type="hidden" name="direction" value="down" />
                      <button
                        type="submit"
                        className={moveButtonClass}
                        disabled={index === tables.length - 1}
                        aria-label={`Move ${table.label} down`}
                      >
                        ↓
                      </button>
                    </form>
                  </div>

                  <div className="min-w-0 flex-1">
                    <TableForm table={{ id: table.id, label: table.label }} />
                  </div>

                  <form action={deleteTable}>
                    <input type="hidden" name="id" value={table.id} />
                    <button
                      type="submit"
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ---- Printable QR sheet (also shown on screen as a preview) ---- */}
      {cells.length > 0 ? (
        <section className="border-t border-gray-100 py-6 print:border-0 print:py-0">
          <h2 className="mb-4 text-sm font-medium text-gray-900 print:hidden">
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
                className="flex break-inside-avoid flex-col items-center gap-2 rounded-lg border border-gray-200 p-4 text-center print:border-black"
              >
                <div
                  className="w-full max-w-[200px] [&_svg]:h-auto [&_svg]:w-full"
                  // QR SVG built server-side from a server-constructed URL (no
                  // user markup); qrcode emits deterministic, script-free SVG.
                  dangerouslySetInnerHTML={{ __html: cell.svg }}
                />
                <p className="text-lg font-semibold text-gray-900 print:text-black">
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
