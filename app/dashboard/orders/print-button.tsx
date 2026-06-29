"use client";

import { Button } from "@/app/_components/button";

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
    <Button variant="secondary" size="sm" onClick={() => print(order)}>
      Print
    </Button>
  );
}
