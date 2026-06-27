"use client";

/**
 * Prints the QR sheet via the browser's native dialog. Reuses the app's
 * established print STYLE (window.print() + Tailwind `print:` utilities) rather
 * than the orders PrintProvider — no single-ticket staging is needed because
 * the whole sheet prints at once. `print:hidden` keeps the button itself off
 * the printed page.
 */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-gray-800 print:hidden"
    >
      Print sheet
    </button>
  );
}
