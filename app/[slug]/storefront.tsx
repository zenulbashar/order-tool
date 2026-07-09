"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { readableOn } from "@/app/_components/brand-contrast";
import { type DietaryTag, normalizeDietaryTags } from "@/lib/validation";

import { CartBar } from "./cart-bar";
import { CartProvider, useCart } from "./cart-provider";
import { CartRail } from "./cart-rail";
import { CartReview } from "./cart-review";
import { CategoryNav } from "./category-nav";
import { ConciergePanel } from "./concierge/concierge-panel";
import { DietaryDisclaimer, DietaryFilter } from "./dietary-filter";
import { ItemCard } from "./item-card";
import { ItemModifierSheet } from "./item-modifier-sheet";
import { MenuSearch } from "./menu-search";
import { RecommendationsProvider } from "./recommendations";
import { BrandTile, StorefrontHero } from "./storefront-hero";
import { itemSearchText, matchesQuery } from "./search";
import { SearchEmptyState } from "./search-empty-state";
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
  // Search no-results → concierge handoff: each nonce bump asks the mounted
  // ConciergePanel to open with the text prefilled (never auto-submitted).
  const [conciergePrefill, setConciergePrefill] = useState({
    text: "",
    nonce: 0,
  });
  // A category chosen from the no-results "maybe try" chips. Clearing the
  // filters and scrolling must happen across a re-render (the section only
  // exists once the full menu is back), so the target is parked in a ref and
  // the scroll — a pure DOM read/write, no state — runs after the commit.
  const pendingCategoryRef = useRef<string | null>(null);

  useEffect(() => {
    if (!pendingCategoryRef.current) return;
    document
      .getElementById(pendingCategoryRef.current)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
    pendingCategoryRef.current = null;
  });

  function clearFilters() {
    setQuery("");
    setSelectedTags([]);
    setSearchExpanded(false);
  }

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
    <>
      <div
        style={brandStyle}
        data-domain="diner"
        className="min-h-dvh bg-surface pb-24 lg:pb-12"
      >
        {/* ============ Desktop app bar (lg+) — full-width shell ============ */}
        <div className="hidden border-b border-sand bg-surface-elevated lg:block">
          <div className="mx-auto flex h-[66px] max-w-[1280px] items-center gap-4 px-6">
            <div className="flex shrink-0 items-center gap-2.5">
              <BrandTile
                venue={venue}
                sizeClass="h-[38px] w-[38px]"
                radiusClass="rounded-[11px]"
                textClass="text-base"
              />
              <span className="max-w-[220px] truncate font-display text-[19px] font-extrabold tracking-tight text-ink">
                {venue.name}
              </span>
            </div>
            {menu.length > 0 ? (
              <div className="mx-auto w-full max-w-[420px]">
                <MenuSearch
                  expanded
                  onExpand={() => setSearchExpanded(true)}
                  onCollapse={() => setSearchExpanded(false)}
                  value={query}
                  onChange={setQuery}
                  resultCount={isSearching ? visibleItemCount : null}
                />
              </div>
            ) : (
              <div className="flex-1" />
            )}
            <div className="flex shrink-0 items-center gap-3">
              {tableLabel.trim() ? (
                <span className="rounded-pill bg-[var(--color-success)]/12 px-3 py-1.5 text-xs font-semibold text-success-deep">
                  Dine-in · Table {tableLabel.trim()}
                </span>
              ) : null}
              <Link
                href={`/${venue.slug}/account`}
                aria-label="Your orders"
                className="flex h-[38px] w-[38px] items-center justify-center rounded-pill bg-sand text-muted transition hover:text-ink"
              >
                <PersonIcon />
              </Link>
            </div>
          </div>
        </div>

        {/* ============ Desktop hero (lg+) ============ */}
        <div className="hidden lg:block">
          <StorefrontHero venue={venue} />
        </div>

        {/* ============ Mobile header (below lg) — unchanged ============ */}
        <div className="lg:hidden">
          {venue.coverUrl ? (
            // Owner-supplied cover image fills the band. next/image would need
            // remote config (house rule).
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={venue.coverUrl}
              alt=""
              className="h-32 w-full object-cover sm:h-40"
            />
          ) : (
            // Default cover band — a decorative warm glow in the venue's --brand.
            <div
              className="h-32 w-full sm:h-40"
              style={{
                background:
                  "radial-gradient(75% 70% at 28% 25%, color-mix(in oklab, var(--brand) 50%, transparent), transparent 72%), var(--color-forest-deep)",
              }}
            />
          )}
          {/* Only the LOGO overlaps the band (-mt-10); name + description sit
              below on the cream surface, fully readable. */}
          <header className="px-5 pb-4">
            <div className="flex items-start justify-between gap-4">
              {venue.logoUrl ? (
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
              <Link
                href={`/${venue.slug}/account`}
                className="shrink-0 text-xs font-medium text-muted transition hover:text-ink"
              >
                Your orders
              </Link>
            </div>
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
        </div>

        {/* ============ Sticky category / search strip ============ */}
        {menu.length > 0 ? (
          <div className="sticky top-0 z-20 border-b border-sand bg-surface/95 backdrop-blur lg:bg-surface-elevated/95">
            {/* Mobile: search + dietary chips + disclaimer + pill nav (unchanged) */}
            <div className="lg:hidden">
              <div className="space-y-2 px-5 pb-3 pt-3">
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
                {availableTags.length > 0 ? <DietaryDisclaimer /> : null}
              </div>
              {navCategories.length > 0 ? (
                <CategoryNav categories={navCategories} />
              ) : null}
            </div>

            {/* Desktop: underline tab strip + dietary chips on the right */}
            <div className="mx-auto hidden max-w-[1280px] px-6 lg:block">
              <div className="flex items-center justify-between gap-4">
                {navCategories.length > 0 ? (
                  <CategoryNav categories={navCategories} variant="tabs" />
                ) : (
                  <span />
                )}
                {availableTags.length > 0 ? (
                  <div className="shrink-0 py-2">
                    <DietaryFilter
                      available={availableTags}
                      selected={activeTags}
                      onToggle={toggleTag}
                    />
                  </div>
                ) : null}
              </div>
              {availableTags.length > 0 ? (
                <div className="pb-2">
                  <DietaryDisclaimer />
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* ============ Body: inner-capped grid (menu · cart rail) ============ */}
        <div className="mx-auto w-full max-w-[1280px] px-5 lg:grid lg:grid-cols-[1fr_336px] lg:items-start lg:gap-[30px] lg:px-6 lg:pt-7">
          <div className="min-w-0">
            {/* AI ordering concierge (#12). Proposes items; tapping one routes
                through setActiveItem -> ItemModifierSheet -> addItem, exactly like
                the menu tiles, never a direct cart write. The CartRail nudge links
                here via #concierge. */}
            {conciergeEnabled && menu.length > 0 ? (
              <div id="concierge" className="scroll-mt-24 pb-2 pt-4 lg:pt-1">
                <ConciergePanel
                  slug={venue.slug}
                  menu={menu}
                  onSelectItem={setActiveItem}
                  onOpenCart={() => setCartOpen(true)}
                  prefill={conciergePrefill}
                />
              </div>
            ) : null}

            <div className="space-y-8 py-6 lg:py-0">
              {menu.length === 0 ? (
                <p className="rounded-card border border-dashed border-sand p-8 text-center text-sm text-muted">
                  This venue hasn’t published a menu yet. Check back soon.
                </p>
              ) : visibleMenu.length === 0 ? (
                <SearchEmptyState
                  query={trimmedQuery}
                  venueName={venue.name}
                  conciergeEnabled={conciergeEnabled}
                  categories={menu.map((category) => ({
                    id: category.id,
                    name: category.name,
                  }))}
                  onAskConcierge={(text) =>
                    setConciergePrefill((current) => ({
                      text,
                      nonce: current.nonce + 1,
                    }))
                  }
                  onClearFilters={clearFilters}
                  onGoToCategory={(id) => {
                    pendingCategoryRef.current = id;
                    clearFilters();
                  }}
                />
              ) : (
                visibleMenu.map((category) => (
                  <section
                    key={category.id}
                    id={category.id}
                    className="scroll-mt-32"
                  >
                    <h2 className="font-display text-xl font-semibold tracking-tight text-ink lg:text-2xl">
                      {category.name}
                    </h2>
                    {category.description ? (
                      <p className="mt-0.5 text-sm text-muted">
                        {category.description}
                      </p>
                    ) : null}
                    <ul className="mt-3 space-y-3 lg:grid lg:grid-cols-2 lg:gap-[18px] lg:space-y-0">
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
          </div>

          {menu.length > 0 ? (
            <CartRail
              slug={venue.slug}
              tableLabel={tableLabel}
              conciergeEnabled={conciergeEnabled}
            />
          ) : null}
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

        {/* Mobile cart bar — the persistent rail replaces it at lg+. */}
        <div className="lg:hidden">
          <CartBar onOpen={() => setCartOpen(true)} />
        </div>

        {/* Cart review drawer. Open-state lives here so the cart bar and the
            concierge can both open it; on desktop the rail is primary. */}
        {cartOpen ? (
          <CartReview
            slug={venue.slug}
            tableLabel={tableLabel}
            onClose={() => setCartOpen(false)}
            onSelectItem={setActiveItem}
          />
        ) : null}
      </div>
    </>
  );
}

function PersonIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px]"
    >
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5" />
    </svg>
  );
}
