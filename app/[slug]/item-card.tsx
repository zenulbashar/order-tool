import { formatCents } from "@/lib/validation";

import type { PublicItem } from "./types";

/**
 * A single menu item row. Tapping it opens the modifier sheet. Rendered inside
 * the client storefront, so the onClick handler is fine without its own
 * "use client" boundary.
 */
export function ItemCard({
  item,
  onSelect,
}: {
  item: PublicItem;
  onSelect: (item: PublicItem) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className="flex w-full items-start justify-between gap-4 py-3 text-left"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900">{item.name}</p>
        {item.description ? (
          <p className="mt-0.5 line-clamp-2 text-sm text-gray-500">
            {item.description}
          </p>
        ) : null}
        <p className="mt-1 text-sm text-gray-700">
          ${formatCents(item.priceCents)}
        </p>
      </div>
      {item.imageUrl ? (
        // Arbitrary owner-supplied URL; next/image would need remote config.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.imageUrl}
          alt={item.name}
          className="h-20 w-20 shrink-0 rounded-lg object-cover"
        />
      ) : null}
    </button>
  );
}
