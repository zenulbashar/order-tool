/**
 * Checkout line planning + price recompute (M3 / audit F8).
 *
 * This is the money decision at the heart of `placeOrder`: given the LIVE,
 * venue-scoped rows already fetched from the database, decide what each cart
 * line actually costs and whether it is allowed at all. It is deliberately
 * PURE — no database, no Stripe, no clock — so the rules that stop a hostile
 * cart from underpaying can be tested exhaustively. The audit's F8 finding is
 * precisely that this path had no test at all.
 *
 * Extracted VERBATIM from app/[slug]/checkout/actions.ts: identical checks in
 * identical order, identical rejection messages, identical arithmetic. The
 * caller still performs every fetch and still owns the transaction; only the
 * decision moved. Callers map `{ok:false, error}` onto their own reject().
 *
 * The security properties under test (each has a case in line-plan.test.ts):
 *  - Prices ALWAYS come from the DB rows, never from client input.
 *  - A variant-priced item requires a variant that belongs to THAT item; a
 *    flat-priced item must carry none.
 *  - A modifier option must belong to a group that belongs to THAT line's
 *    item — this is what blocks cross-item and cross-venue option injection
 *    (a forged id is structurally absent from the maps).
 *  - Duplicate option ids are rejected outright.
 *  - Per-group min/max selection is enforced server-side.
 */

export type ItemRow = { id: string; name: string; priceCents: number };

export type VariantRow = {
  id: string;
  itemId: string;
  name: string;
  priceCents: number;
};

export type GroupRow = {
  id: string;
  itemId: string;
  minSelect: number;
  maxSelect: number;
};

export type OptionRow = {
  id: string;
  groupId: string;
  name: string;
  priceDeltaCents: number;
};

export type CartLine = {
  itemId: string;
  variantId?: string | null;
  quantity: number;
  selectedOptionIds: string[];
};

export type LinePlan = {
  item: ItemRow;
  // The chosen size variant for a variant-priced line; null for a flat line.
  variant: VariantRow | null;
  quantity: number;
  unitCents: number;
  lineTotalCents: number;
  options: { id: string; name: string; priceDeltaCents: number }[];
};

/** The live, venue-scoped rows the caller fetched for this cart. */
export type MenuSnapshot = {
  itemById: Map<string, ItemRow>;
  variantById: Map<string, VariantRow>;
  /** Items that have at least one variant — i.e. are variant-priced. */
  itemsWithVariants: Set<string>;
  groupById: Map<string, GroupRow>;
  groupsByItem: Map<string, GroupRow[]>;
  optionById: Map<string, OptionRow>;
};

export type LinePlanResult =
  | { ok: true; plan: LinePlan[]; subtotalCents: number }
  | { ok: false; error: string };

/**
 * Validate every cart line against live menu rows and recompute the subtotal
 * from DB prices. Returns the first rejection encountered, matching the
 * original sequential behaviour.
 */
export function planOrderLines(
  lines: CartLine[],
  snapshot: MenuSnapshot,
): LinePlanResult {
  const {
    itemById,
    variantById,
    itemsWithVariants,
    groupById,
    groupsByItem,
    optionById,
  } = snapshot;

  const plan: LinePlan[] = [];
  let subtotalCents = 0;

  for (const line of lines) {
    const item = itemById.get(line.itemId);
    if (!item) {
      return { ok: false, error: "An item in your cart is no longer available." };
    }

    // VARIANT: derive this line's base price. A variant-priced item REQUIRES a
    // chosen size that belongs to THIS item (the venue is already scoped by the
    // fetch); a flat-priced item must carry no variant. The base is read from the
    // DB row — the client's price is never trusted, and an invalid/missing/stray
    // variant id is rejected, not silently priced.
    const hasVariants = itemsWithVariants.has(line.itemId);
    let baseCents: number;
    let chosenVariant: VariantRow | null = null;
    if (hasVariants) {
      if (!line.variantId) {
        return {
          ok: false,
          error: "Please choose a size for an item in your cart.",
        };
      }
      const variant = variantById.get(line.variantId);
      if (!variant || variant.itemId !== line.itemId) {
        return {
          ok: false,
          error: "A size in your cart is no longer available.",
        };
      }
      baseCents = variant.priceCents;
      chosenVariant = variant;
    } else {
      if (line.variantId) return { ok: false, error: "Invalid selection." };
      baseCents = item.priceCents;
    }

    const optionIds = line.selectedOptionIds;
    if (new Set(optionIds).size !== optionIds.length) {
      return { ok: false, error: "Invalid selection." };
    }

    const chosen: { id: string; name: string; priceDeltaCents: number }[] = [];
    const countByGroup = new Map<string, number>();
    for (const optionId of optionIds) {
      const option = optionById.get(optionId);
      if (!option) {
        return {
          ok: false,
          error: "A selected option is no longer available.",
        };
      }
      const group = groupById.get(option.groupId);
      // The option's group MUST belong to this line's item — blocks
      // cross-item / cross-venue option injection.
      if (!group || group.itemId !== line.itemId) {
        return { ok: false, error: "Invalid selection." };
      }
      countByGroup.set(
        option.groupId,
        (countByGroup.get(option.groupId) ?? 0) + 1,
      );
      chosen.push({
        id: option.id,
        name: option.name,
        priceDeltaCents: option.priceDeltaCents,
      });
    }

    // Enforce min/max per group server-side; never trust client-side gating.
    for (const group of groupsByItem.get(line.itemId) ?? []) {
      const selected = countByGroup.get(group.id) ?? 0;
      if (selected < group.minSelect || selected > group.maxSelect) {
        return {
          ok: false,
          error: "Please review the required options for an item.",
        };
      }
    }

    // Modifiers layer ON TOP of the size: base is the variant (or item) price,
    // plus the server-recomputed modifier deltas. Identical math to before — only
    // the base differs for variant-priced lines.
    const deltaCents = chosen.reduce((sum, o) => sum + o.priceDeltaCents, 0);
    const unitCents = baseCents + deltaCents;
    const lineTotalCents = unitCents * line.quantity;
    subtotalCents += lineTotalCents;
    plan.push({
      item,
      variant: chosenVariant,
      quantity: line.quantity,
      unitCents,
      lineTotalCents,
      options: chosen,
    });
  }

  return { ok: true, plan, subtotalCents };
}
