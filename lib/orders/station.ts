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
