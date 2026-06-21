"use client";

import { useMemo, useState } from "react";

import { CategoryNav } from "./category-nav";
import { ItemCard } from "./item-card";
import { ItemModifierSheet } from "./item-modifier-sheet";
import { OrderTypeSelector } from "./order-type-selector";
import type { OrderType, PublicItem, PublicMenu, PublicVenue } from "./types";

/**
 * Top-level client storefront shell. Holds the browse-time UI state (order
 * type, table label, the item whose modifier sheet is open) and applies the
 * venue's brand colour as a runtime CSS variable consumed by descendants.
 *
 * Cart wiring (add-to-cart, the persistent cart bar, and cart review) arrives
 * in the next commit; for now adding an item just closes the sheet.
 */
export function Storefront({
  venue,
  menu,
  initialTable,
}: {
  venue: PublicVenue;
  menu: PublicMenu;
  initialTable: string;
}) {
  const [orderType, setOrderType] = useState<OrderType>(
    initialTable ? "dinein" : "pickup",
  );
  const [tableLabel, setTableLabel] = useState(initialTable);
  const [activeItem, setActiveItem] = useState<PublicItem | null>(null);

  const brandStyle = { "--brand": venue.brandColor } as React.CSSProperties;
  const navCategories = useMemo(
    () => menu.map((category) => ({ id: category.id, name: category.name })),
    [menu],
  );

  return (
    <div
      style={brandStyle}
      className="mx-auto min-h-dvh max-w-2xl bg-white pb-24"
    >
      <header className="flex items-center gap-4 px-5 py-6">
        {venue.logoUrl ? (
          // Arbitrary owner-supplied URL; next/image would need remote config.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={venue.logoUrl}
            alt={`${venue.name} logo`}
            className="h-12 w-12 rounded-full object-cover"
          />
        ) : (
          <span
            className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-semibold text-white"
            style={{ backgroundColor: "var(--brand)" }}
          >
            {venue.name.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight text-gray-900">
            {venue.name}
          </h1>
          {venue.storefrontDescription ? (
            <p className="truncate text-sm text-gray-500">
              {venue.storefrontDescription}
            </p>
          ) : null}
        </div>
      </header>

      <div className="px-5 pb-4">
        <OrderTypeSelector
          orderType={orderType}
          onOrderType={setOrderType}
          tableLabel={tableLabel}
          onTableLabel={setTableLabel}
        />
      </div>

      {menu.length > 0 ? <CategoryNav categories={navCategories} /> : null}

      <div className="space-y-8 px-5 py-6">
        {menu.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
            This venue hasn’t published a menu yet. Check back soon.
          </p>
        ) : (
          menu.map((category) => (
            <section key={category.id} id={category.id} className="scroll-mt-28">
              <h2 className="text-lg font-semibold tracking-tight text-gray-900">
                {category.name}
              </h2>
              {category.description ? (
                <p className="mt-0.5 text-sm text-gray-500">
                  {category.description}
                </p>
              ) : null}
              <ul className="mt-1 divide-y divide-gray-100">
                {category.items.map((item) => (
                  <li key={item.id}>
                    <ItemCard item={item} onSelect={setActiveItem} />
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      {activeItem ? (
        <ItemModifierSheet
          key={activeItem.id}
          item={activeItem}
          onClose={() => setActiveItem(null)}
        />
      ) : null}
    </div>
  );
}
