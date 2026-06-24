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

import { OrderTicket } from "./order-ticket";
import type { KitchenOrder } from "./queries";

type PrintContextValue = {
  /** Stage a print-only ticket for this order and open the browser print dialog. */
  print: (order: KitchenOrder) => void;
  /** True while a ticket is staged — used to pause the queue poller. */
  isPrinting: boolean;
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
 * into here; we render EXACTLY ONE OrderTicket into a print-only root and call
 * window.print(). Single-order print scope is therefore structural — only one
 * ticket ever exists in the DOM — not a CSS race to hide every other card.
 *
 * Print hide is pure CSS (Tailwind `print:` variants): while a ticket is staged
 * the dashboard subtree collapses to display:none in print (header, the
 * auto-refresh indicator, every card and all its controls), and the print-root
 * — hidden on screen — shows. The hide is conditional on isPrinting, so a stray
 * Ctrl+P with nothing staged prints the normal dashboard, not a blank page.
 *
 * Robust to the poller: the staged order lives in client state, and a
 * router.refresh() preserves useState, so a refresh firing mid-print can never
 * blank or swap the ticket. (The poller also pauses on isPrinting.)
 */
export function PrintProvider({
  venueName,
  timezone,
  children,
}: {
  venueName: string;
  timezone: string;
  children: React.ReactNode;
}) {
  const [printingOrder, setPrintingOrder] = useState<KitchenOrder | null>(null);

  const print = useCallback((order: KitchenOrder) => {
    // flushSync commits the ticket (and the chrome-hide) to the DOM *before*
    // the synchronous print dialog opens, so the right ticket is captured.
    flushSync(() => setPrintingOrder(order));
    window.print();
  }, []);

  // Clear once the dialog closes. window.print() blocks on desktop, but
  // afterprint is the cross-browser-correct signal and also covers browsers
  // where printing is asynchronous.
  useEffect(() => {
    const clear = () => setPrintingOrder(null);
    window.addEventListener("afterprint", clear);
    return () => window.removeEventListener("afterprint", clear);
  }, []);

  const isPrinting = printingOrder !== null;
  const value = useMemo(() => ({ print, isPrinting }), [print, isPrinting]);

  return (
    <PrintContext.Provider value={value}>
      <div className={isPrinting ? "print:hidden" : undefined}>{children}</div>
      {printingOrder ? (
        <div className="hidden print:block">
          <OrderTicket
            order={printingOrder}
            venueName={venueName}
            timezone={timezone}
          />
        </div>
      ) : null}
    </PrintContext.Provider>
  );
}
