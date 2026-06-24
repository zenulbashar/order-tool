"use client";

import { usePrint } from "./print-context";
import type { KitchenOrder } from "./queries";

/**
 * Per-card "Print" control, alongside the status controls. Prints ONLY this
 * order's ticket: it hands its already-loaded order to the PrintProvider, which
 * stages exactly that one ticket and opens the print dialog. Printing is
 * read-only — it never touches fulfillment status, payment, or snapshots.
 */
export function PrintButton({ order }: { order: KitchenOrder }) {
  const { print } = usePrint();

  return (
    <button
      type="button"
      onClick={() => print(order)}
      className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
    >
      Print
    </button>
  );
}
