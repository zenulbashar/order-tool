"use client";

import { Button } from "@/app/_components/button";

/**
 * Prints the QR sheet via the browser's native dialog. Reuses the app's
 * established print STYLE (window.print() + Tailwind `print:` utilities) rather
 * than the orders PrintProvider — no single-ticket staging is needed because
 * the whole sheet prints at once. `print:hidden` keeps the button itself off
 * the printed page.
 */
export function PrintButton() {
  return (
    <Button
      variant="primary"
      size="sm"
      onClick={() => window.print()}
      className="print:hidden"
    >
      Print sheet
    </Button>
  );
}
