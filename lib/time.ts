/**
 * Format an order's placed-at instant in the VENUE's timezone (e.g.
 * "Australia/Brisbane"), never the server's UTC. Used on the owner kitchen view
 * so times read as the venue's wall clock. A short date is included so orders
 * that span midnight — or the completed history — stay unambiguous.
 *
 * venues.timezone is NOT NULL with a sane default, but a malformed IANA zone
 * would make Intl throw and take down the whole kitchen page, so fall back to
 * UTC rather than crash.
 */
export function formatVenueTime(date: Date, timeZone: string): string {
  const options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  };
  try {
    return new Intl.DateTimeFormat("en-AU", { ...options, timeZone }).format(date);
  } catch {
    return `${new Intl.DateTimeFormat("en-AU", { ...options, timeZone: "UTC" }).format(date)} UTC`;
  }
}
