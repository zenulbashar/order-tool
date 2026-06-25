"use client";

import { useMemo, useState } from "react";

import { CartBar } from "./cart-bar";
import { CartProvider, useCart } from "./cart-provider";
import { CategoryNav } from "./category-nav";
import { ItemCard } from "./item-card";
import { ItemModifierSheet } from "./item-modifier-sheet";
import { MenuSearch } from "./menu-search";
import { OrderTypeSelector } from "./order-type-selector";
import { itemSearchText, matchesQuery } from "./search";
import type { OrderType, PublicItem, PublicMenu, PublicVenue } from "./types";

/**
 * Top-level storefront. The cart provider wraps everything so the modifier
 * sheet and cart bar can read/write cart state; the venue's brand colour is
 * applied as a runtime CSS variable consumed by descendants.
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
  return (
    <CartProvider slug={venue.slug} menu={menu}>
      <StorefrontInner venue={venue} menu={menu} initialTable={initialTable} />
    </CartProvider>
  );
}

function StorefrontInner({
  venue,
  menu,
  initialTable,
}: {
  venue: PublicVenue;
  menu: PublicMenu;
  initialTable: string;
}) {
  const { addItem } = useCart();
  const [orderType, setOrderType] = useState<OrderType>(
    initialTable ? "dinein" : "pickup",
  );
  const [tableLabel, setTableLabel] = useState(initialTable);
  const [activeItem, setActiveItem] = useState<PublicItem | null>(null);
  const [query, setQuery] = useState("");

  const brandStyle = { "--brand": venue.brandColor } as React.CSSProperties;

  // Normalize each item's searchable text ONCE per menu, not per keystroke, so
  // typing stays instant over a large menu — the filter below is only substring
  // / bounded-distance checks against these precomputed haystacks.
  const searchIndex = useMemo(
    () =>
      menu.map((category) => ({
        id: category.id,
        name: category.name,
        description: category.description,
        items: category.items.map((item) => ({
          item,
          haystack: itemSearchText(item.name, item.description),
        })),
      })),
    [menu],
  );

  const trimmedQuery = query.trim();
  const isSearching = trimmedQuery.length > 0;

  // The menu actually rendered: the full menu (same reference, identical order)
  // when not searching, otherwise each category filtered to its name/description
  // matches with empty categories dropped — so results stay grouped under their
  // headings and the cleared view is byte-for-byte today's.
  const visibleMenu = useMemo<PublicMenu>(() => {
    if (!isSearching) return menu;
    const result: PublicMenu = [];
    for (const category of searchIndex) {
      const items = category.items
        .filter((entry) => matchesQuery(trimmedQuery, entry.haystack))
        .map((entry) => entry.item);
      if (items.length > 0) {
        result.push({
          id: category.id,
          name: category.name,
          description: category.description,
          items,
        });
      }
    }
    return result;
  }, [isSearching, trimmedQuery, searchIndex, menu]);

  const navCategories = useMemo(
    () =>
      visibleMenu.map((category) => ({ id: category.id, name: category.name })),
    [visibleMenu],
  );

  const visibleItemCount = useMemo(
    () =>
      visibleMenu.reduce((total, category) => total + category.items.length, 0),
    [visibleMenu],
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

      {menu.length > 0 ? (
        <div className="sticky top-0 z-20 border-b border-gray-100 bg-white/95 backdrop-blur">
          <div className="px-5 pb-3 pt-3">
            <MenuSearch
              value={query}
              onChange={setQuery}
              resultCount={isSearching ? visibleItemCount : null}
            />
          </div>
          {navCategories.length > 0 ? (
            <CategoryNav categories={navCategories} />
          ) : null}
        </div>
      ) : null}

      <div className="space-y-8 px-5 py-6">
        {menu.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
            This venue hasn’t published a menu yet. Check back soon.
          </p>
        ) : visibleMenu.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
            No items match “{trimmedQuery}”.
          </p>
        ) : (
          visibleMenu.map((category) => (
            <section key={category.id} id={category.id} className="scroll-mt-32">
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
          onAdd={addItem}
        />
      ) : null}

      <CartBar
        slug={venue.slug}
        orderType={orderType}
        tableLabel={tableLabel}
      />
    </div>
  );
}
