"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { flushSync } from "react-dom";

import { buildStationLabels } from "@/lib/orders/station";

import { OrderTicket } from "./order-ticket";
import { PackagingDocket } from "./packaging-docket";
import type { KitchenOrder, PrintStation } from "./queries";
import { StationLabelDocket } from "./station-label";

/** Which document a print action stages. */
export type PrintKind = "receipt" | "packaging" | "labels";

type PrintContextValue = {
  /** Stage a print-only document for this order and open the browser dialog. */
  print: (order: KitchenOrder, kind?: PrintKind) => void;
  /** True while a document is staged — used to pause the queue poller. */
  isPrinting: boolean;
  /** Venue master switch: are the packaging / per-station prints offered at all. */
  stationPrintingEnabled: boolean;
  /** True when at least one station has its sticky label enabled. */
  hasStationLabels: boolean;
  /** How many station labels a specific order would produce (0 → nothing to print). */
  stationLabelCount: (order: KitchenOrder) => number;
};

const PrintContext = createContext<PrintContextValue | null>(null);

/** Access the print trigger + printing flag. Must be used within <PrintProvider>. */
export function usePrint(): PrintContextValue {
  const value = useContext(PrintContext);
  if (!value) {
    throw new Error("usePrint must be used within <PrintProvider>.");
  }
  return value;
}

/**
 * Owns browser-print for the orders page. A card lifts its already-loaded order
 * into here; we render EXACTLY ONE print document into a print-only root and
 * call window.print(). Single-document print scope is therefore structural —
 * only one document ever exists in the DOM — not a CSS race to hide every card.
 *
 * A print action names the document it wants:
 *  - "receipt"   → the customer receipt (all items + prices + total);
 *  - "packaging" → the packaging/front-counter docket (all items, no prices);
 *  - "labels"    → one sticky label per station that has items in the order,
 *                  each price-free and headed "<number>-<code>" (e.g. "42-K").
 * Stations that have labels disabled are filtered out; a "labels" print with
 * nothing to route stages nothing (the dialog is only opened once a document is
 * committed to the DOM).
 *
 * Print hide is pure CSS (Tailwind `print:` variants): while a document is
 * staged the dashboard subtree collapses to display:none in print and the
 * print-root — hidden on screen — shows. Robust to the poller: the staged order
 * lives in client state (survives router.refresh()), and the poller pauses on
 * isPrinting.
 */
export function PrintProvider({
  venueName,
  timezone,
  stations,
  stationPrintingEnabled,
  children,
}: {
  venueName: string;
  timezone: string;
  stations: PrintStation[];
  stationPrintingEnabled: boolean;
  children: React.ReactNode;
}) {
  const [staged, setStaged] = useState<{
    order: KitchenOrder;
    kind: PrintKind;
  } | null>(null);

  const print = useCallback(
    (order: KitchenOrder, kind: PrintKind = "receipt") => {
      // A "labels" print with no printable station in the order has nothing to
      // stage — don't open a blank dialog.
      if (kind === "labels") {
        const printable = stations.filter((s) => s.labelPrintEnabled);
        if (buildStationLabels(order.items, printable).length === 0) return;
      }
      // flushSync commits the document (and the chrome-hide) to the DOM *before*
      // the synchronous print dialog opens, so the right document is captured.
      flushSync(() => setStaged({ order, kind }));
      window.print();
    },
    [stations],
  );

  // Clear once the dialog closes. window.print() blocks on desktop, but
  // afterprint is the cross-browser-correct signal and also covers browsers
  // where printing is asynchronous.
  useEffect(() => {
    const clear = () => setStaged(null);
    window.addEventListener("afterprint", clear);
    return () => window.removeEventListener("afterprint", clear);
  }, []);

  const isPrinting = staged !== null;
  const hasStationLabels =
    stationPrintingEnabled && stations.some((s) => s.labelPrintEnabled);

  const stationLabelCount = useCallback(
    (order: KitchenOrder) => {
      if (!stationPrintingEnabled) return 0;
      const printable = stations.filter((s) => s.labelPrintEnabled);
      return buildStationLabels(order.items, printable).length;
    },
    [stationPrintingEnabled, stations],
  );

  const value = useMemo(
    () => ({
      print,
      isPrinting,
      stationPrintingEnabled,
      hasStationLabels,
      stationLabelCount,
    }),
    [
      print,
      isPrinting,
      stationPrintingEnabled,
      hasStationLabels,
      stationLabelCount,
    ],
  );

  return (
    <PrintContext.Provider value={value}>
      <div className={isPrinting ? "print:hidden" : undefined}>{children}</div>
      {staged ? (
        <div className="hidden print:block">
          <StagedDocument
            staged={staged}
            stations={stations}
            venueName={venueName}
            timezone={timezone}
          />
        </div>
      ) : null}
    </PrintContext.Provider>
  );
}

/** Render the single staged document for the chosen print kind. */
function StagedDocument({
  staged,
  stations,
  venueName,
  timezone,
}: {
  staged: { order: KitchenOrder; kind: PrintKind };
  stations: PrintStation[];
  venueName: string;
  timezone: string;
}) {
  const { order, kind } = staged;

  if (kind === "packaging") {
    return (
      <PackagingDocket
        order={order}
        stations={stations}
        venueName={venueName}
        timezone={timezone}
      />
    );
  }

  if (kind === "labels") {
    const printable = stations.filter((s) => s.labelPrintEnabled);
    const labels = buildStationLabels(order.items, printable);
    return (
      <>
        {labels.map((label) => (
          <StationLabelDocket
            key={label.station.id}
            label={label}
            order={order}
          />
        ))}
      </>
    );
  }

  return <OrderTicket order={order} venueName={venueName} timezone={timezone} />;
}
