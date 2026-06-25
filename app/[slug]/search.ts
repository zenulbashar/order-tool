/**
 * Dependency-free fuzzy match for the storefront search. Filters the
 * already-loaded menu by item name + description — case-insensitive,
 * diacritic-folded, and typo-tolerant. No new dependency: a tiny normalize plus
 * a length-bounded Levenshtein is all a name/description match needs, and it
 * keeps the client bundle lean.
 *
 * Match rule: the query is split into tokens and an item matches only when
 * EVERY token matches its haystack (name + description) — so "chicken burger"
 * narrows rather than widens. Each token matches by substring first (the
 * instant common case, and what partial typing hits), and only falls back to a
 * bounded edit-distance check against each haystack word for a genuine typo
 * ("chesse" -> "cheese"). Tokens shorter than 3 characters are substring-only,
 * since fuzzing them just adds noise ("tea" -> "sea").
 */

/** Lowercase, strip diacritics, and collapse whitespace to single spaces. */
export function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritical marks
    .replace(/\s+/g, " ")
    .trim();
}

/** Precomputed, normalized search text for one item (name + description). */
export function itemSearchText(
  name: string,
  description: string | null,
): string {
  return normalize(`${name} ${description ?? ""}`);
}

/**
 * Levenshtein distance with an early-out: returns the true distance, or any
 * value greater than `max` as soon as it's certain the distance exceeds the
 * budget. A length-gap reject and a per-row minimum keep the typo path cheap.
 */
function boundedDistance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost, // substitution
      );
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return max + 1; // whole row past the budget -> give up
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/**
 * Typo budget grows with token length; short tokens get none. Two edits are
 * reserved for long tokens (>= 8 chars) — at 1 edit per ~4 chars two edits on a
 * 6-letter word over-matches (e.g. "burger" reaching "butter"), so 3–7 char
 * tokens get a single edit, which still covers ordinary single-key typos.
 */
function typoBudget(length: number): number {
  if (length < 3) return 0; // substring-only below this
  if (length < 8) return 1;
  return 2;
}

/**
 * Does `query` match the precomputed `haystack`? True when every query token
 * matches — by substring, or within its length-scaled edit-distance budget of
 * some haystack word. An empty query matches everything. The haystack is split
 * into words lazily, only when a token actually needs the fuzzy fallback.
 */
export function matchesQuery(query: string, haystack: string): boolean {
  const normalized = normalize(query);
  if (normalized.length === 0) return true;

  const tokens = normalized.split(" ");
  let words: string[] | null = null;

  for (const token of tokens) {
    if (haystack.includes(token)) continue; // exact / partial / substring

    const budget = typoBudget(token.length);
    if (budget === 0) return false;

    if (words === null) words = haystack.split(" ");
    const fuzzy = words.some(
      (word) => boundedDistance(word, token, budget) <= budget,
    );
    if (!fuzzy) return false;
  }

  return true;
}
