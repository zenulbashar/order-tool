/**
 * The single definition of "these two menu items have the same name".
 *
 * Two places need to agree on this and previously did not share it:
 *
 *  - `lib/menu-health.ts` grades a venue-wide `duplicate_name` as a CRITICAL
 *    issue, AFTER the duplicates already exist;
 *  - the AI menu import appends blindly, which is how they come to exist in the
 *    first place — importing the same menu photo twice, or importing a menu that
 *    overlaps what is already there.
 *
 * Having the import prevent exactly what menu health penalises only works if the
 * two use the same comparison. A drift here would be quiet and confusing: the
 * import would allow a name the health score then marks critical.
 *
 * Deliberately conservative — case and surrounding whitespace only. It does NOT
 * fold internal whitespace, punctuation or accents, because "Cafe Latte" and
 * "Café Latte" may well be different products on a real menu, and refusing to
 * import the second would be worse than allowing it.
 */
export function normalizeMenuItemName(name: string): string {
  return name.trim().toLowerCase();
}
