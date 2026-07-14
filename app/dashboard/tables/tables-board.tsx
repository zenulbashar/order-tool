"use client";

import { useState } from "react";
import { flushSync } from "react-dom";

import { readableOn } from "@/app/_components/brand-contrast";
import { cx } from "@/app/_components/cx";

import { deleteTable } from "./actions";
import type { TableStatus } from "./queries";
import { TableForm } from "./table-form";

type BoardTable = {
  id: string;
  label: string;
  seats: number | null;
  status: TableStatus;
  svg: string; // server-rendered QR SVG (deterministic, script-free)
};

const STATUS: Record<TableStatus, { label: string; cls: string }> = {
  ordering: {
    label: "Ordering",
    cls: "bg-[var(--color-accent)]/25 text-ink",
  },
  seated: {
    label: "Seated",
    cls: "bg-[var(--color-success)]/15 text-success-deep",
  },
  open: { label: "Open", cls: "border border-line text-muted" },
};

function StatusBadge({ status }: { status: TableStatus }) {
  const s = STATUS[status];
  return (
    <span
      className={cx(
        "shrink-0 rounded-pill px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider",
        s.cls,
      )}
    >
      {s.label}
    </span>
  );
}

/**
 * A branded table tent: the venue's brand colour + logo in a header band, then a
 * white body with the table number, QR, and the scan-to-order cue. Brand-colored
 * (not the platform amber — this is the venue's own collateral); the white body
 * keeps print toner-friendly and the QR high-contrast. Contrast-aware text via
 * readableOn so the band reads on any brand colour.
 */
function TableTent({
  table,
  venueName,
  logoUrl,
  brandColor,
  print,
}: {
  table: BoardTable;
  venueName: string;
  logoUrl: string | null;
  brandColor: string;
  print?: boolean;
}) {
  const bandInk = readableOn(brandColor);
  return (
    <div
      className={cx(
        "break-inside-avoid overflow-hidden rounded-card border",
        print ? "border-black/15" : "shadow-card",
      )}
      style={{ borderColor: print ? undefined : `${brandColor}33` }}
    >
      {/* Brand header band — logo + venue name. The arbitrary print-color-adjust
          forces the coloured band to actually print (browsers drop backgrounds
          by default). */}
      <div
        className="flex items-center justify-center gap-2 px-6 py-4 [print-color-adjust:exact] [-webkit-print-color-adjust:exact]"
        style={{ backgroundColor: brandColor, color: bandInk }}
      >
        {logoUrl ? (
          // Height-sized, natural width, object-contain so the FULL wordmark
          // shows (never centre-cropped). White chip keeps it legible on the band.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt=""
            className="h-7 w-auto max-w-[130px] rounded bg-white/95 object-contain p-0.5"
          />
        ) : null}
        <span className="font-display text-base font-bold">{venueName}</span>
      </div>

      {/* White body — table number, QR, cue. */}
      <div className="bg-white px-6 py-5 text-center text-ink">
        <p
          className="font-display text-2xl font-extrabold [print-color-adjust:exact] [-webkit-print-color-adjust:exact]"
          style={{ color: brandColor }}
        >
          Table {table.label}
        </p>
        <div
          className="mx-auto mt-3 w-40 rounded-xl border border-black/5 bg-white p-3 [&_svg]:block [&_svg]:h-auto [&_svg]:w-full"
          // QR SVG built server-side from a server-constructed URL (no user markup).
          dangerouslySetInnerHTML={{ __html: table.svg }}
        />
        <p className="mt-4 text-sm font-semibold text-ink">Scan to order &amp; pay</p>
        <p className="text-xs text-muted">No app — right from your phone.</p>
      </div>
    </div>
  );
}

export function TablesBoard({
  tables,
  venueName,
  logoUrl,
  brandColor,
}: {
  tables: BoardTable[];
  venueName: string;
  logoUrl: string | null;
  brandColor: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    tables[0]?.id ?? null,
  );
  const [addOpen, setAddOpen] = useState(tables.length === 0);
  const [editOpen, setEditOpen] = useState(false);
  const [printMode, setPrintMode] = useState<"none" | "one" | "all">("none");
  const [printId, setPrintId] = useState<string | null>(null);

  const selected =
    tables.find((t) => t.id === selectedId) ?? tables[0] ?? null;
  const occupied = tables.filter((t) => t.status !== "open").length;
  const openCount = tables.length - occupied;
  const printTarget = tables.find((t) => t.id === printId) ?? selected;

  function doPrint(mode: "one" | "all", id?: string) {
    // Render the print-only tent(s) synchronously, print, then hide again.
    flushSync(() => {
      setPrintId(id ?? null);
      setPrintMode(mode);
    });
    window.print();
    setPrintMode("none");
  }
  function printOne(id: string) {
    doPrint("one", id);
  }
  function download(table: BoardTable) {
    const blob = new Blob([table.svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `table-${table.label}-qr.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <section className="px-5 py-6 print:hidden">
        {/* Header */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">
              Tables
            </h1>
            {tables.length > 0 ? (
              <p className="mt-0.5 text-sm text-muted">
                <span className="text-success-deep" aria-hidden>
                  ●
                </span>{" "}
                {occupied} seated · {openCount} open
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {tables.length > 0 ? (
              <button
                type="button"
                onClick={() => doPrint("all")}
                className="rounded-control border border-line-strong bg-surface-elevated px-3.5 py-2 text-sm font-semibold text-ink transition hover:bg-hover-secondary"
              >
                <span aria-hidden>🖨</span> Print all QR
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="rounded-control bg-forest px-3.5 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            >
              ＋ Add table
            </button>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
          {/* Card grid */}
          <div className="grid auto-rows-min grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
            {tables.map((table) => {
              const isSelected = selected?.id === table.id;
              return (
                <div
                  key={table.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedId(table.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedId(table.id);
                    }
                  }}
                  className={cx(
                    "flex cursor-pointer flex-col rounded-card border bg-surface-elevated p-3 shadow-card transition",
                    isSelected
                      ? "border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]"
                      : "border-line hover:border-line-strong",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-display text-base font-extrabold text-ink">
                      {table.label}
                    </span>
                    <StatusBadge status={table.status} />
                  </div>
                  <div
                    className="mt-2 aspect-square w-full rounded-input border border-line bg-white p-2 [&_svg]:block [&_svg]:h-full [&_svg]:w-full"
                    dangerouslySetInnerHTML={{ __html: table.svg }}
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-muted">
                      {table.seats != null ? `${table.seats} seats` : "—"}
                    </span>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        printOne(table.id);
                      }}
                      className="text-xs font-semibold text-ink hover:underline"
                    >
                      Print
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Add-table card */}
            <div className="flex min-h-[13rem] flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-line p-4 text-center">
              {addOpen ? (
                <div className="w-full">
                  <TableForm />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="flex flex-col items-center gap-1 text-muted transition hover:text-ink"
                >
                  <span className="text-2xl" aria-hidden>
                    ＋
                  </span>
                  <span className="text-sm font-semibold">Add table</span>
                </button>
              )}
            </div>
          </div>

          {/* Detail pane — table tent */}
          {selected ? (
            <aside className="lg:sticky lg:top-6 lg:self-start">
              <p className="mb-2 font-mono text-[9px] font-bold uppercase tracking-wider text-label">
                Table tent · {selected.label}
              </p>
              <TableTent
                table={selected}
                venueName={venueName}
                logoUrl={logoUrl}
                brandColor={brandColor}
              />
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => printOne(selected.id)}
                  className="flex-1 rounded-control bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-forest transition hover:opacity-90"
                >
                  <span aria-hidden>🖨</span> Print
                </button>
                <button
                  type="button"
                  onClick={() => download(selected)}
                  className="flex-1 rounded-control border border-line-strong bg-surface-elevated px-4 py-2 text-sm font-semibold text-ink transition hover:bg-hover-secondary"
                >
                  Download
                </button>
              </div>

              <div className="mt-3 rounded-card border border-line bg-surface-elevated p-3 shadow-sm">
                {editOpen ? (
                  <div className="space-y-3">
                    <TableForm
                      table={{
                        id: selected.id,
                        label: selected.label,
                        seats: selected.seats,
                      }}
                    />
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setEditOpen(false)}
                        className="text-xs font-semibold text-muted hover:text-ink"
                      >
                        Done
                      </button>
                      <form action={deleteTable}>
                        <input type="hidden" name="id" value={selected.id} />
                        <button
                          type="submit"
                          className="text-xs font-semibold text-[var(--color-warm)] hover:underline"
                        >
                          Delete table
                        </button>
                      </form>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditOpen(true)}
                    className="text-xs font-semibold text-[var(--action)] hover:underline"
                  >
                    Edit name &amp; seats
                  </button>
                )}
              </div>
            </aside>
          ) : null}
        </div>
      </section>

      {/* Print-only tents (hidden on screen). */}
      {printMode !== "none" ? (
        <div className="hidden print:block">
          <p className="mb-4 text-center font-display text-lg font-semibold">
            {venueName} — scan to order
          </p>
          {printMode === "all" ? (
            <div className="grid grid-cols-2 gap-6">
              {tables.map((table) => (
                <TableTent
                  key={table.id}
                  table={table}
                  venueName={venueName}
                  logoUrl={logoUrl}
                  brandColor={brandColor}
                  print
                />
              ))}
            </div>
          ) : printTarget ? (
            <div className="mx-auto max-w-xs">
              <TableTent
                table={printTarget}
                venueName={venueName}
                logoUrl={logoUrl}
                brandColor={brandColor}
                print
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
