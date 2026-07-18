/**
 * Docket prep-station routing. A menu item's line is printed either under the
 * KITCHEN section or the FRONT-COUNTER section (where the drinks fridge usually
 * is) of the order docket. Drinks shouldn't sit on a kitchen ticket, so this
 * splits them out.
 *
 * Resolution (owner's decision: "auto-detect by category name, but let the
 * owner override an item"):
 *  - an explicit per-item override ("kitchen" | "counter") always wins;
 *  - "auto" (the default) detects drinks by the item's CATEGORY NAME — a
 *    beverage-ish category routes to the front counter, everything else to the
 *    kitchen.
 *
 * Pure + dependency-free so both the server queries and the client docket
 * components can import it (no server-only modules reach the client bundle).
 */

/** The two physical stations a docket line can be routed to. */
export type Station = "kitchen" | "counter";

/** The stored per-item setting: "auto" defers to category detection. */
export type StationSetting = "auto" | Station;

// Category-name signals for a drinks/front-counter section. Matched
// case-insensitively as whole-ish words against the category name, so
// "Hot Drinks", "Soft Drinks", "Bar", "Wine List", "Coffee & Tea" all route to
// the counter while "Burgers", "Sides", "Kids" stay in the kitchen. Substring
// matching is deliberately avoided for short tokens that hide inside food words
// (e.g. "tea" in "steak") — see matchesDrinkKeyword below.
const DRINK_KEYWORDS = [
  "drink",
  "drinks",
  "beverage",
  "beverages",
  "bar",
  "cocktail",
  "cocktails",
  "mocktail",
  "mocktails",
  "spirit",
  "spirits",
  "wine",
  "wines",
  "beer",
  "beers",
  "cider",
  "ciders",
  "soft drink",
  "soda",
  "sodas",
  "juice",
  "juices",
  "smoothie",
  "smoothies",
  "shake",
  "shakes",
  "milkshake",
  "milkshakes",
  "coffee",
  "espresso",
  "tea",
  "teas",
  "latte",
  "water",
  "kombucha",
] as const;

/**
 * True when a category name reads as a drinks/beverage section. Tokenises the
 * name on non-letter boundaries and checks whole-word membership, plus a couple
 * of two-word phrases ("soft drink"). Whole-word matching avoids false hits
 * like "tea" inside "steak" or "bar" inside "barramundi".
 */
function matchesDrinkKeyword(categoryName: string): boolean {
  const lower = categoryName.toLowerCase();
  const words = lower.split(/[^a-z]+/).filter(Boolean);
  const wordSet = new Set(words);
  for (const keyword of DRINK_KEYWORDS) {
    if (keyword.includes(" ")) {
      if (lower.includes(keyword)) return true;
    } else if (wordSet.has(keyword)) {
      return true;
    }
  }
  return false;
}

/**
 * Resolve the docket station for one line. An explicit override wins; otherwise
 * "auto" detects a drink by category name (unknown/missing category → kitchen,
 * the safe default so nothing silently disappears off the kitchen ticket).
 */
export function resolveStation(
  setting: StationSetting | null | undefined,
  categoryName: string | null | undefined,
): Station {
  if (setting === "kitchen" || setting === "counter") return setting;
  if (categoryName && matchesDrinkKeyword(categoryName)) return "counter";
  return "kitchen";
}

/**
 * Partition already-station-resolved docket lines into the kitchen section and
 * the front-counter (drinks) section, preserving each line's original order.
 * The docket renders the kitchen section first, then a dotted tear-line, then
 * the counter section — only showing the divider when BOTH are present, so a
 * kitchen-only order looks exactly as it did before this split existed.
 */
export function splitByStation<T extends { station: Station }>(
  items: T[],
): { kitchen: T[]; counter: T[] } {
  const kitchen: T[] = [];
  const counter: T[] = [];
  for (const item of items) {
    if (item.station === "counter") counter.push(item);
    else kitchen.push(item);
  }
  return { kitchen, counter };
}

/* -------------------------------------------------------------------------- */
/* Owner-defined stations — per-station sticky/label dockets                   */
/* -------------------------------------------------------------------------- */

/**
 * A minimal reference to an owner-defined prep station (venue_stations row),
 * carrying only what a label needs: the id items are routed by, the display
 * name, and the short `code` used in the `<number>-<code>` heading (e.g. "K").
 */
export type StationRef = {
  id: string;
  name: string;
  code: string;
};

/**
 * One printable per-station label. `items` are the order lines prepared at this
 * station (full detail — name, qty, modifiers); `otherItemCount` is the summed
 * QUANTITY of every other line in the order, collapsed to a single "+N more
 * items" line so a small label surface stays legible. The kebab station's label
 * for a 3-item order thus reads "1× Kebab … +2 more items" — the packer at that
 * station sees exactly what to make, and how many pieces belong to the same
 * order without reading foreign item names.
 */
export type StationLabel<T> = {
  station: StationRef;
  items: T[];
  otherItemCount: number;
};

/**
 * Total pieces in an order line. Defaults to 1 when a line carries no quantity,
 * so the "+N more items" tally counts items, never silently drops an untyped
 * line to zero.
 */
function lineQuantity(item: { quantity?: number | null }): number {
  const q = item.quantity;
  return typeof q === "number" && q > 0 ? q : 1;
}

/**
 * Build the per-station labels for one order. For every station that has at
 * least one line in this order (iterated in the caller-supplied `stations`
 * order, which is the owner's sortOrder), returns that station's lines plus the
 * count of pieces belonging to OTHER stations / no station — the "+N more items"
 * collapse. Stations with nothing in the order are omitted (no blank label
 * prints). Pure and dependency-free so both the server query and the client
 * docket components can call it.
 *
 * Routing is by `item.stationId`; a line whose stationId is null (no owner
 * station, or its station was deleted) belongs to no label and only ever shows
 * up inside another station's "+N more items" tally — it still appears in full
 * on the receipt and the packaging docket, which is where unrouted items are
 * meant to be assembled.
 */
export function buildStationLabels<
  T extends { stationId?: string | null; quantity?: number | null },
>(items: T[], stations: StationRef[]): StationLabel<T>[] {
  const totalPieces = items.reduce((sum, item) => sum + lineQuantity(item), 0);

  const labels: StationLabel<T>[] = [];
  for (const station of stations) {
    const mine = items.filter((item) => item.stationId === station.id);
    if (mine.length === 0) continue;
    const minePieces = mine.reduce((sum, item) => sum + lineQuantity(item), 0);
    labels.push({
      station,
      items: mine,
      otherItemCount: totalPieces - minePieces,
    });
  }
  return labels;
}

/**
 * The label heading tag: the order's daily number joined to the station code by
 * a hyphen, e.g. order 42 at the Kebab station → "42-K". Falls back to the label
 * text "ORDER" prefix only at the call site; here we just format the pair. When
 * the order has no daily number yet (null), the code stands alone so the tag is
 * never a bare "-K".
 */
export function formatStationTag(
  dailyNumber: number | null | undefined,
  code: string,
): string {
  const c = code.trim().toUpperCase();
  return dailyNumber != null ? `${dailyNumber}-${c}` : c;
}

/**
 * Normalise a station code: letters/digits only, uppercased, 1-3 characters
 * (mirrors the DB CHECK). When the raw code cleans to empty, fall back to the
 * name's first alphanumeric character so a station always has a usable initial.
 * Returns "" only when neither the code nor the name has any alphanumeric — the
 * caller treats that as a validation error. Shared by the onboarding step and
 * the settings editor so both derive codes identically.
 */
export function normaliseStationCode(rawCode: string, name: string): string {
  const cleaned = rawCode
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 3);
  if (cleaned.length > 0) return cleaned;
  return name
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 1);
}
