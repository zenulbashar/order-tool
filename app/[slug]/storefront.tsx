"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { readableOn } from "@/app/_components/brand-contrast";
import { type DietaryTag, normalizeDietaryTags } from "@/lib/validation";

import { CartBar } from "./cart-bar";
import { CartProvider, useCart } from "./cart-provider";
import { CartReview } from "./cart-review";
import { CategoryNav } from "./category-nav";
import { ConciergePanel } from "./concierge/concierge-panel";
import { DietaryDisclaimer, DietaryFilter } from "./dietary-filter";
import { ItemCard } from "./item-card";
import { ItemModifierSheet } from "./item-modifier-sheet";
import { MenuSearch } from "./menu-search";
import { RecommendationsProvider } from "./recommendations";
import { itemSearchText, matchesQuery } from "./search";
import type {
  PublicItem,
  PublicMenu,
  PublicRecommendations,
  PublicVenue,
} from "./types";

/**
 * Top-level storefront. The cart provider wraps everything so the modifier
 * sheet and cart bar can read/write cart state; the venue's brand colour is
 * applied as a runtime CSS variable consumed by descendants.
 */
export function Storefront({
  venue,
  menu,
  initialTable,
  recommendations,
  conciergeEnabled,
}: {
  venue: PublicVenue;
  menu: PublicMenu;
  initialTable: string;
  recommendations: PublicRecommendations;
  conciergeEnabled: boolean;
}) {
  return (
    <CartProvider slug={venue.slug} menu={menu}>
      <RecommendationsProvider menu={menu} recommendations={recommendations}>
        <StorefrontInner
          venue={venue}
          menu={menu}
          initialTable={initialTable}
          conciergeEnabled={conciergeEnabled}
        />
      </RecommendationsProvider>
    </CartProvider>
  );
}

function StorefrontInner({
  venue,
  menu,
  initialTable,
  conciergeEnabled,
}: {
  venue: PublicVenue;
  menu: PublicMenu;
  initialTable: string;
  conciergeEnabled: boolean;
}) {
  const { addItem } = useCart();
  // A table-QR arrival (?table=) is implicitly dine-in; this hint is forwarded to
  // checkout, which is now the single place the order type is chosen (A2). The
  // landing no longer shows a pickup/dine-in toggle.
  const tableLabel = initialTable;
  const [activeItem, setActiveItem] = useState<PublicItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<DietaryTag[]>([]);
  // Pure UI state: whether the search control is expanded into its full-width
  // input. Separate from `query` (the filter state) — toggling this never
  // touches the search/filter logic below.
  const [searchExpanded, setSearchExpanded] = useState(false);

  const brandStyle = {
    "--brand": venue.brandColor,
    "--brand-contrast": readableOn(venue.brandColor),
  } as React.CSSProperties;

  // The dietary tags actually in use across this venue's menu, in canonical
  // order — only these become filter chips, so there are never dead chips.
  const availableTags = useMemo(
    () =>
      normalizeDietaryTags(
        menu.flatMap((category) =>
          category.items.flatMap((item) => item.tags),
        ),
      ),
    [menu],
  );

  // Keep the selection valid if the menu changes (e.g. a tag falls out of use):
  // never filter by a tag with no chip.
  const activeTags = useMemo(
    () => selectedTags.filter((tag) => availableTags.includes(tag)),
    [selectedTags, availableTags],
  );

  function toggleTag(tag: DietaryTag) {
    setSelectedTags((current) =>
      current.includes(tag)
        ? current.filter((t) => t !== tag)
        : [...current, tag],
    );
  }

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
  const isFiltering = isSearching || activeTags.length > 0;
  // Show the full-width input when the user expanded it OR whenever a query is
  // present, so a non-empty search never collapses back to the icon.
  const searchOpen = searchExpanded || query.length > 0;

  // The menu actually rendered: the full menu (same reference, identical order)
  // when no filter is active, otherwise each category filtered to items passing
  // BOTH the search predicate AND the tag predicate, with empty categories
  // dropped — so results stay grouped under their headings and the cleared view
  // is byte-for-byte today's. Tag filtering is AND: an item must carry EVERY
  // selected tag.
  const visibleMenu = useMemo<PublicMenu>(() => {
    if (!isFiltering) return menu;
    const result: PublicMenu = [];
    for (const category of searchIndex) {
      const items = category.items
        .filter(
          (entry) =>
            (!isSearching || matchesQuery(trimmedQuery, entry.haystack)) &&
            activeTags.every((tag) => entry.item.tags.includes(tag)),
        )
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
  }, [isFiltering, isSearching, trimmedQuery, activeTags, searchIndex, menu]);

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
      style={brandStyle} data-domain="diner"
      className="mx-auto min-h-dvh max-w-3xl bg-surface pb-24"
    >
      {/* Cover band — a decorative warm glow in the venue's OWN --brand colour
          (sign-in's color-mix technique). No photo or fabricated data; a real
          venue cover image could later fill this same band as an <img>. */}
      <div
        className="h-32 w-full sm:h-40"
        style={{
          background:
            "radial-gradient(75% 70% at 28% 25%, color-mix(in oklab, var(--brand) 50%, transparent), transparent 72%), var(--color-forest-deep)",
        }}
      />
      {/* Only the LOGO overlaps the band (-mt-10). The name + description sit
          below the band in normal flow on the cream surface, fully readable. */}
      <header className="px-5 pb-4">
        <div className="flex items-start justify-between gap-4">
          {venue.logoUrl ? (
            // Arbitrary owner-supplied URL; next/image would need remote config.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={venue.logoUrl}
              alt={`${venue.name} logo`}
              className="-mt-10 h-16 w-16 shrink-0 rounded-pill object-cover ring-4 ring-surface"
            />
          ) : (
            <span
              className="-mt-10 flex h-16 w-16 shrink-0 items-center justify-center rounded-pill text-2xl font-semibold text-[var(--action-contrast)] ring-4 ring-surface"
              style={{ backgroundColor: "var(--action)" }}
            >
              {venue.name.charAt(0).toUpperCase()}
            </span>
          )}
          {/* Opt-in customer area (#7) — never blocks ordering; guests ignore it. */}
          <Link
            href={`/${venue.slug}/account`}
            className="shrink-0 text-xs font-medium text-muted transition hover:text-ink"
          >
            Your orders
          </Link>
        </div>
        {/* No truncate, so a long venue name wraps instead of clipping. */}
        <div className="mt-3">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
            {venue.name}
          </h1>
          {venue.storefrontDescription ? (
            <p className="mt-0.5 text-sm text-muted">
              {venue.storefrontDescription}
            </p>
          ) : null}
        </div>
      </header>

      {/* Menu search pinned directly under the header (A1): the primary way to
          find an item, kept above the AI launcher rather than stacked beneath it.
          Sticky so it stays reachable while scrolling a long menu. */}
      {menu.length > 0 ? (
        <div className="sticky top-0 z-20 border-b border-sand bg-surface/95 backdrop-blur">
          <div className="space-y-2 px-5 pb-3 pt-3">
            {/* Search shares one row with the dietary chips: chips scroll on the
                LEFT, the search control is pinned RIGHT (shrink-0, never pushed
                off). Tapping the search icon expands it to a full-width input
                (the chips yield the row); it collapses back to the icon when
                cleared. The input still drives the same `query`/onChange and all
                filter logic is unchanged. */}
            <div className="flex items-start gap-2">
              {searchOpen ? (
                <MenuSearch
                  expanded
                  onExpand={() => setSearchExpanded(true)}
                  onCollapse={() => setSearchExpanded(false)}
                  value={query}
                  onChange={setQuery}
                  resultCount={isSearching ? visibleItemCount : null}
                />
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <DietaryFilter
                      available={availableTags}
                      selected={activeTags}
                      onToggle={toggleTag}
                    />
                  </div>
                  <MenuSearch
                    expanded={false}
                    onExpand={() => setSearchExpanded(true)}
                    onCollapse={() => setSearchExpanded(false)}
                    value={query}
                    onChange={setQuery}
                    resultCount={isSearching ? visibleItemCount : null}
                  />
                </>
              )}
            </div>
            {/* Life-safety dietary disclaimer stays ALWAYS visible, independent
                of the search expand state. */}
            {availableTags.length > 0 ? <DietaryDisclaimer /> : null}
          </div>
          {navCategories.length > 0 ? (
            <CategoryNav categories={navCategories} />
          ) : null}
        </div>
      ) : null}

      {/* AI ordering concierge (#12). Gated on the single canUseConcierge seam
          and hidden when there's no menu to ground in. Proposes items; tapping
          one routes through setActiveItem -> the existing ItemModifierSheet ->
          addItem, exactly like the menu tiles, never a direct cart write. Sits
          just below the menu search (A1), above the menu list. */}
      {conciergeEnabled && menu.length > 0 ? (
        <div className="px-5 pb-2 pt-4">
          <ConciergePanel
            slug={venue.slug}
            menu={menu}
            onSelectItem={setActiveItem}
            onOpenCart={() => setCartOpen(true)}
          />
        </div>
      ) : null}

      <div className="space-y-8 px-5 py-6">
        {menu.length === 0 ? (
          <p className="rounded-card border border-dashed border-sand p-8 text-center text-sm text-muted">
            This venue hasn’t published a menu yet. Check back soon.
          </p>
        ) : visibleMenu.length === 0 ? (
          <p className="rounded-card border border-dashed border-sand p-8 text-center text-sm text-muted">
            {isSearching
              ? `No items match “${trimmedQuery}”${activeTags.length > 0 ? " with those dietary tags" : ""}.`
              : "No items match those dietary tags."}
          </p>
        ) : (
          visibleMenu.map((category) => (
            <section key={category.id} id={category.id} className="scroll-mt-32">
              <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
                {category.name}
              </h2>
              {category.description ? (
                <p className="mt-0.5 text-sm text-muted">
                  {category.description}
                </p>
              ) : null}
              <ul className="mt-3 space-y-3">
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
          onSelectItem={setActiveItem}
        />
      ) : null}

      <CartBar onOpen={() => setCartOpen(true)} />

      {/* Cart review drawer. Its open-state lives here in StorefrontInner so both
          the cart bar and (in a later step) the concierge panel can open it. */}
      {cartOpen ? (
        <CartReview
          slug={venue.slug}
          tableLabel={tableLabel}
          onClose={() => setCartOpen(false)}
          onSelectItem={setActiveItem}
        />
      ) : null}
    </div>
  );
}
