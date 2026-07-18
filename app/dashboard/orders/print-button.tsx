"use client";

import { Button } from "@/app/_components/button";

import { usePrint } from "./print-context";
import type { KitchenOrder } from "./queries";

/**
 * Print controls for one order. Prints are read-only — they never touch
 * fulfillment status, payment, or snapshots; each hands the already-loaded
 * order to the PrintProvider, which stages exactly that one document.
 *
 * A single-station venue sees just "Print" (the customer receipt), exactly as
 * before. A venue that turned multi-station printing on in onboarding also gets
 * "Packaging" (the all-items assembly docket) and, when the order has items at a
 * label-enabled station, "Labels" (one sticky label per station). The Labels
 * control hides for an order that routes to no station, so it's never a dead
 * button.
 */
export function PrintButton({ order }: { order: KitchenOrder }) {
  const { print, stationPrintingEnabled, stationLabelCount } = usePrint();
  const labelCount = stationPrintingEnabled ? stationLabelCount(order) : 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => print(order, "receipt")}
      >
        {stationPrintingEnabled ? "Receipt" : "Print"}
      </Button>
      {stationPrintingEnabled ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => print(order, "packaging")}
        >
          Packaging
        </Button>
      ) : null}
      {labelCount > 0 ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => print(order, "labels")}
        >
          {labelCount === 1 ? "Label" : `Labels (${labelCount})`}
        </Button>
      ) : null}
    </div>
  );
}
