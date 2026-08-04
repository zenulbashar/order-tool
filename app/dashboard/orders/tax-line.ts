import { formatCents } from "@/lib/validation";

/**
 * The owner-facing GST line for a single order, or null when there is nothing
 * honest to show.
 *
 * GST here is INCLUSIVE: `taxCents` is the component already contained in the
 * order total, never an addition to it — so the copy says "incl.", matching the
 * diner receipt. Getting that wrong on an owner surface would be worse than
 * omitting it, because this is the figure a BAS gets assembled from.
 *
 * Only the DECISION lives here, not the markup. The three surfaces that show it
 * (the board card, the ticket drawer, the printed docket) style it differently —
 * the docket is monochrome and bold for a thermal printer — but they must agree
 * on WHEN it appears, and that is the part that would otherwise drift.
 *
 * Returns null when the venue has GST off (`taxLabel` is null) or the order
 * carries no component, so a $0 GST line never prints.
 */
export function taxLineText(
  taxLabel: string | null,
  taxCents: number,
): string | null {
  if (!taxLabel || taxCents <= 0) return null;
  return `incl. ${taxLabel} $${formatCents(taxCents)}`;
}
