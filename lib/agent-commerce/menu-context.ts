import type { PublicMenu } from "@/app/[slug]/types";
import { formatCents } from "@/lib/validation";

/**
 * Compact, model-facing view of the live menu — the ONLY set a model may pick
 * from — including modifier groups with their option ids, so an agent taking
 * an order over the phone can satisfy required choices. Prices are INPUT (so a
 * budget can be honoured); they are never trusted on output: ids are resolved
 * to live prices by validateOrderRequest / the cart. Pure.
 */
export function buildMenuContext(menu: PublicMenu): string {
  const items: Record<string, unknown>[] = [];
  for (const category of menu) {
    for (const item of category.items) {
      const entry: Record<string, unknown> = {
        id: item.id,
        name: item.name,
        category: category.name,
      };
      if (item.description) entry.description = item.description;
      if (item.tags.length > 0) entry.tags = item.tags;
      if (item.variants.length > 0) {
        entry.sizes = item.variants.map((variant) => ({
          id: variant.id,
          name: variant.name,
          price: `$${formatCents(variant.priceCents)}`,
        }));
      } else {
        entry.price = `$${formatCents(item.priceCents)}`;
      }
      if (item.groups.length > 0) {
        entry.choices = item.groups.map((group) => ({
          name: group.name,
          required: group.minSelect > 0,
          minSelect: group.minSelect,
          maxSelect: group.maxSelect,
          options: group.options.map((option) => ({
            id: option.id,
            name: option.name,
            ...(option.priceDeltaCents !== 0
              ? { extra: `$${formatCents(option.priceDeltaCents)}` }
              : {}),
          })),
        }));
      }
      items.push(entry);
    }
  }
  return `MENU (the ONLY items you may offer; use each "id" verbatim):\n${JSON.stringify(items)}`;
}
