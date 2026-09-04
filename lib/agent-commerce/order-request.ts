import type { PublicItem, PublicMenu } from "@/app/[slug]/types";
import { MAX_LINE_QUANTITY } from "@/lib/orders/limits";

import type { HandoffLine } from "./cart-handoff";

/**
 * Validate an agent's order request against the LIVE public menu — the same
 * rules the cart and placeOrder enforce, applied up front so the agent gets a
 * precise reason instead of the diner discovering it at checkout. Prices come
 * from the menu, never from the request. Pure.
 */

export type OrderRequestLine = {
  itemId: string;
  variantId?: string | null;
  optionIds?: string[];
  quantity?: number;
};

export type ResolvedLine = HandoffLine & {
  name: string;
  variantName: string | null;
  optionNames: string[];
  unitCents: number;
  lineCents: number;
};

export type OrderRequestResult =
  | { ok: true; lines: ResolvedLine[]; subtotalCents: number }
  | { ok: false; error: string };

function findItem(menu: PublicMenu, itemId: string): PublicItem | null {
  for (const category of menu) {
    const item = category.items.find((candidate) => candidate.id === itemId);
    if (item) return item;
  }
  return null;
}

export function validateOrderRequest(
  menu: PublicMenu,
  request: OrderRequestLine[],
): OrderRequestResult {
  if (!Array.isArray(request) || request.length === 0) {
    return { ok: false, error: "Add at least one line to the order." };
  }
  const lines: ResolvedLine[] = [];
  for (const raw of request) {
    const item = findItem(menu, raw.itemId);
    if (!item) {
      return {
        ok: false,
        error: `Item ${raw.itemId} is not on the menu right now — call get_menu for current ids.`,
      };
    }
    const quantity = raw.quantity ?? 1;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) {
      return {
        ok: false,
        error: `Quantity for ${item.name} must be a whole number from 1 to ${MAX_LINE_QUANTITY}.`,
      };
    }
    let unitCents = item.priceCents;
    let variantName: string | null = null;
    let variantId: string | null = null;
    if (item.variants.length > 0) {
      const variant = item.variants.find((candidate) => candidate.id === raw.variantId);
      if (!variant) {
        return {
          ok: false,
          error: `${item.name} needs a size: choose one of ${item.variants
            .map((v) => `${v.id} (${v.name})`)
            .join(", ")}.`,
        };
      }
      unitCents = variant.priceCents;
      variantName = variant.name;
      variantId = variant.id;
    } else if (raw.variantId) {
      return { ok: false, error: `${item.name} has no sizes; omit variantId.` };
    }
    const optionIds = [...new Set(raw.optionIds ?? [])];
    const optionNames: string[] = [];
    for (const group of item.groups) {
      const chosen = group.options.filter((option) => optionIds.includes(option.id));
      if (chosen.length < group.minSelect) {
        return {
          ok: false,
          error: `${item.name}: choose at least ${group.minSelect} from "${group.name}" (${group.options
            .map((o) => `${o.id} (${o.name})`)
            .join(", ")}).`,
        };
      }
      if (group.maxSelect > 0 && chosen.length > group.maxSelect) {
        return {
          ok: false,
          error: `${item.name}: choose at most ${group.maxSelect} from "${group.name}".`,
        };
      }
      for (const option of chosen) {
        unitCents += option.priceDeltaCents;
        optionNames.push(option.name);
      }
    }
    const knownOptionIds = new Set(item.groups.flatMap((g) => g.options.map((o) => o.id)));
    const unknown = optionIds.filter((id) => !knownOptionIds.has(id));
    if (unknown.length > 0) {
      return {
        ok: false,
        error: `${item.name}: unknown option id(s) ${unknown.join(", ")}.`,
      };
    }
    lines.push({
      itemId: item.id,
      variantId,
      selectedOptionIds: optionIds,
      quantity,
      name: item.name,
      variantName,
      optionNames,
      unitCents,
      lineCents: unitCents * quantity,
    });
  }
  const subtotalCents = lines.reduce((sum, line) => sum + line.lineCents, 0);
  return { ok: true, lines, subtotalCents };
}
