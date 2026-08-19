/**
 * Build a storefront href that CARRIES the dine-in table through navigation.
 *
 * The printed QR (lib/qr.ts) points at `/{slug}?table=<label>` — the landing
 * view — but ordering happens on `/{slug}/menu`, and every route between the two
 * hard-coded a table-less href. The label is persisted nowhere else: the cart
 * stores only item ids, there is no cookie and no middleware. So a diner who
 * scanned the tent at table 12 arrived at checkout with no table, the order type
 * fell back to `pickup`, the docket printed PICKUP, and the tables board never
 * saw them. The QR feature was defeated on effectively every scan, and the
 * "Dine-in · Table 12" pill vanishing was the only (silent) cue.
 *
 * Pure and dependency-free so the server components, the client storefront and
 * the category tiles can all share ONE definition — three hand-built hrefs is
 * exactly how this drifted in the first place.
 *
 * The query goes BEFORE the fragment (`?table=5#drinks`), which is the only
 * valid ordering — a fragment swallows everything after it.
 */
export function menuHref(
  slug: string,
  table: string | null | undefined,
  hash?: string,
): string {
  const query =
    table && table.length > 0 ? `?table=${encodeURIComponent(table)}` : "";
  const fragment = hash ? `#${hash}` : "";
  return `/${slug}/menu${query}${fragment}`;
}
