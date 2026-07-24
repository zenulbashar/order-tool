"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { type DietaryTag, normalizeDietaryTags } from "@/lib/validation";

import { CartBar } from "./cart-bar";
import { CartProvider, useCart } from "./cart-provider";
import { CartRail } from "./cart-rail";
import { CartReview } from "./cart-review";
import { CategoryNav } from "./category-nav";
import { ConciergeLauncher } from "./concierge-launcher";
import { DietaryDisclaimer, DietaryFilter } from "./dietary-filter";
import { ItemCard } from "./item-card";
import { ItemModifierSheet } from "./item-modifier-sheet";
import { MenuSearch } from "./menu-search";
import { RecommendationsProvider } from "./recommendations";
import { AnnouncementBar } from "./announcement-bar";
import { dinerBrandStyle } from "./brand-style";
import { CategoryTiles } from "./category-tiles";
import { StorefrontFooter } from "./storefront-footer";
import { BrandTile, StorefrontHero } from "./storefront-hero";
import { itemSearchText, matchesQuery } from "./search";
import { SearchEmptyState } from "./search-empty-state";
import type {
  PublicFaq,
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
  faqs = [],
  view = "menu",
}: {
  venue: PublicVenue;
  menu: PublicMenu;
  initialTable: string;
  recommendations: PublicRecommendations;
  conciergeEnabled: boolean;
  /** Owner-authored storefront FAQs, shown in the footer (visible + JSON-LD). */
  faqs?: PublicFaq[];
  // "landing" = the categories page (hero + big category tiles, no menu/rail);
  // "menu" = the ordering page (tabs + item grid + cart rail). Split across two
  // routes so neither page is a long scroll.
  view?: "landing" | "menu";
}) {
  return (
    <CartProvider slug={venue.slug} menu={menu}>
      <RecommendationsProvider menu={menu} recommendations={recommendations}>
        <StorefrontInner
          venue={venue}
          menu={menu}
          initialTable={initialTable}
          conciergeEnabled={conciergeEnabled}
          faqs={faqs}
          view={view}
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
  faqs,
  view,
}: {
  venue: PublicVenue;
  menu: PublicMenu;
  initialTable: string;
  conciergeEnabled: boolean;
  faqs: PublicFaq[];
  view: "landing" | "menu";
}) {
  const { addItem, count: cartCount } = useCart();
  const isLanding = view === "landing";
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
  // Desktop "Dietary filters" popover (the mobile chip row is always visible).
  const [dietaryOpen, setDietaryOpen] = useState(false);
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

  // Open the concierge modal directly (desktop FAB + cart-rail nudge). Reuses the
  // panel's prefill-nonce open path with empty text, so it lands straight on the
  // AI input — no intermediate "ask" tile.
  function openConcierge() {
    setConciergePrefill((current) => ({ text: "", nonce: current.nonce + 1 }));
  }

  function scrollToId(id: string) {
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Two-colour venue theming (--brand + optional --color-ink override).
  const brandStyle = dinerBrandStyle(venue);
  // Desktop hero rotation: the non-empty of up to three owner photos.
  const heroImages = [venue.coverUrl, venue.coverUrl2, venue.coverUrl3].filter(
    (url): url is string => Boolean(url),
  );
  // Header nav links resolve to real content only (never dead links).
  const hasAbout = Boolean(venue.storefrontDescription);
  const hasContact = Boolean(
    venue.streetAddress ||
      venue.suburb ||
      venue.phone ||
      (venue.openingHours && venue.openingHours.length > 0),
  );

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

  // Visual "browse by category" tiles: each category's first item photo, or null
  // (the tile then shows a brand-tinted monogram). Derived from the FULL menu.
  const categoryTiles = useMemo(
    () =>
      menu.map((category) => ({
        id: category.id,
        name: category.name,
        image:
          category.items.find((item) => item.imageUrl)?.imageUrl ?? null,
      })),
    [menu],
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
        className="min-h-dvh bg-surface pb-24 lg:pb-0"
      >
        {/* Owner promo bar — very top, scrolls away, dismissible. */}
        <AnnouncementBar slug={venue.slug} text={venue.announcement} />

        {/* ============ Desktop app bar (lg+) — centered brand logo, search on
            the right (big-brand hospitality pattern). Sticky so the logo stays a
            one-click "home" (scroll to top) while browsing. ============ */}
        <div className="hidden border-b border-sand bg-surface-elevated lg:sticky lg:top-0 lg:z-30 lg:block">
          <div className="relative mx-auto flex h-16 max-w-[1440px] 2xl:max-w-[1680px] items-center justify-between px-6">
            {/* Left: venue name (kept small — the hero carries the identity). */}
            <span className="max-w-[280px] truncate text-sm font-semibold text-ink">
              {venue.name}
            </span>

            {/* Center: the brand logo, a scroll-to-top "home". */}
            <button
              type="button"
              onClick={() =>
                window.scrollTo({ top: 0, behavior: "smooth" })
              }
              aria-label={`${venue.name} — back to top`}
              className="absolute left-1/2 -translate-x-1/2"
            >
              <BrandTile
                venue={venue}
                heightClass="h-12"
                maxWClass="max-w-[220px]"
                radiusClass="rounded-[11px]"
                textClass="text-lg"
              />
            </button>

            {/* Right: nav links, search lens (menu only), cart, account. */}
            <div className="flex shrink-0 items-center gap-3">
              <nav className="hidden items-center gap-5 text-sm font-medium text-muted lg:flex">
                {isLanding ? (
                  menu.length > 0 ? (
                    <Link
                      href={`/${venue.slug}/menu`}
                      className="transition hover:text-ink"
                    >
                      Menu
                    </Link>
                  ) : null
                ) : (
                  <Link
                    href={`/${venue.slug}`}
                    className="transition hover:text-ink"
                  >
                    Categories
                  </Link>
                )}
                {hasAbout ? (
                  <button
                    type="button"
                    onClick={() => scrollToId("storefront-footer")}
                    className="transition hover:text-ink"
                  >
                    About
                  </button>
                ) : null}
                {hasContact ? (
                  <button
                    type="button"
                    onClick={() => scrollToId("storefront-footer")}
                    className="transition hover:text-ink"
                  >
                    Contact
                  </button>
                ) : null}
              </nav>
              {tableLabel.trim() ? (
                <span className="rounded-pill bg-[var(--color-success)]/12 px-3 py-1.5 text-xs font-semibold text-success-deep">
                  Dine-in · Table {tableLabel.trim()}
                </span>
              ) : null}
              {!isLanding && menu.length > 0 ? (
                <div className={searchOpen ? "w-72" : ""}>
                  <MenuSearch
                    expanded={searchOpen}
                    onExpand={() => setSearchExpanded(true)}
                    onCollapse={() => setSearchExpanded(false)}
                    value={query}
                    onChange={setQuery}
                    resultCount={isSearching ? visibleItemCount : null}
                  />
                </div>
              ) : null}
              {/* Cart icon — opens the review drawer; badge shows item count. */}
              <button
                type="button"
                onClick={() => setCartOpen(true)}
                aria-label={`View cart${cartCount > 0 ? ` (${cartCount})` : ""}`}
                className="relative flex h-10 w-10 items-center justify-center rounded-pill bg-sand text-muted transition hover:text-ink"
              >
                <CartIcon />
                {cartCount > 0 ? (
                  <span
                    className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-pill px-1 text-[10px] font-bold text-[var(--action-contrast)]"
                    style={{ backgroundColor: "var(--action)" }}
                  >
                    {cartCount}
                  </span>
                ) : null}
              </button>
              <Link
                href={`/${venue.slug}/account`}
                aria-label="Your orders"
                className="flex h-10 w-10 items-center justify-center rounded-pill bg-sand text-muted transition hover:text-ink"
              >
                <PersonIcon />
              </Link>
            </div>
          </div>
        </div>

        {/* ============ Desktop hero (lg+) — LANDING only ============ */}
        {isLanding ? (
          <div className="hidden lg:block">
            <StorefrontHero venue={venue} images={heroImages} />
          </div>
        ) : null}

        {/* ============ Mobile header (below lg) ============ */}
        {isLanding ? (
          <div className="lg:hidden">
            {venue.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={venue.coverUrl}
                alt=""
                // Mobile LCP element: eager + high priority (preloaded from the
                // server page). Dimensions reserve the band to avoid shift.
                width={1200}
                height={480}
                fetchPriority="high"
                decoding="async"
                className="h-32 w-full object-cover sm:h-40"
              />
            ) : (
              <div
                className="h-32 w-full sm:h-40"
                style={{
                  background:
                    "radial-gradient(75% 70% at 28% 25%, color-mix(in oklab, var(--brand) 50%, transparent), transparent 72%), var(--color-forest-deep)",
                }}
              />
            )}
            <header className="px-5 pb-4">
              <div className="flex items-start justify-between gap-4">
                {venue.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={venue.logoUrl}
                    alt={`${venue.name} logo`}
                    className="-mt-10 h-16 w-16 shrink-0 rounded-2xl bg-surface-elevated object-contain p-1 ring-4 ring-surface"
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
        ) : (
          // Menu view (mobile): a slim bar with a back-to-categories link — no big
          // cover band, so the items are reachable without a long scroll.
          <div className="border-b border-sand bg-surface-elevated px-5 py-3 lg:hidden">
            <div className="flex items-center justify-between gap-3">
              <Link
                href={`/${venue.slug}`}
                className="shrink-0 text-xs font-medium text-muted transition hover:text-ink"
              >
                ← Categories
              </Link>
              <span className="truncate font-display text-base font-semibold text-ink">
                {venue.name}
              </span>
              <Link
                href={`/${venue.slug}/account`}
                className="shrink-0 text-xs font-medium text-muted transition hover:text-ink"
              >
                Your orders
              </Link>
            </div>
          </div>
        )}

        {/* ============ Categories landing — big tiles (both breakpoints) ============ */}
        {isLanding ? (
          <div className="mx-auto w-full max-w-[1440px] 2xl:max-w-[1680px] px-5 py-8 lg:px-6 lg:py-12">
            <h2 className="mb-5 font-display text-2xl font-bold tracking-tight text-ink">
              Browse by category
            </h2>
            <CategoryTiles
              slug={venue.slug}
              categories={categoryTiles.slice(0, 6)}
            />
            {menu.length > 0 ? (
              <div className="mt-8 text-center">
                <Link
                  href={`/${venue.slug}/menu`}
                  className="inline-flex items-center gap-2 rounded-pill bg-ink px-6 py-3 text-sm font-semibold text-surface transition hover:-translate-y-px hover:shadow-lift"
                >
                  View the full menu
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* ============ Sticky category / search strip (MENU view) ============ */}
        {!isLanding && menu.length > 0 ? (
          <div className="sticky top-0 z-20 border-b border-sand bg-surface/95 backdrop-blur lg:top-16 lg:bg-surface-elevated/95">
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

            {/* Desktop: underline tab strip + a single aligned "Dietary
                filters" pill that opens a popover (chips + the life-safety
                disclaimer), matching the design. */}
            <div className="mx-auto hidden max-w-[1440px] 2xl:max-w-[1680px] items-center justify-between gap-4 px-6 lg:flex">
              {navCategories.length > 0 ? (
                <CategoryNav categories={navCategories} variant="tabs" />
              ) : (
                <span />
              )}
              {availableTags.length > 0 ? (
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setDietaryOpen((open) => !open)}
                    aria-expanded={dietaryOpen}
                    className={`inline-flex items-center gap-1.5 rounded-pill border px-3.5 py-2 text-xs font-semibold transition ${
                      activeTags.length > 0
                        ? "border-transparent text-[var(--action-contrast)]"
                        : "border-line-strong bg-surface-elevated text-ink hover:bg-hover-secondary"
                    }`}
                    style={
                      activeTags.length > 0
                        ? { backgroundColor: "var(--action)" }
                        : undefined
                    }
                  >
                    <SlidersIcon />
                    Dietary filters
                    {activeTags.length > 0 ? ` · ${activeTags.length}` : ""}
                  </button>
                  {dietaryOpen ? (
                    <>
                      {/* click-away */}
                      <button
                        type="button"
                        aria-hidden="true"
                        tabIndex={-1}
                        onClick={() => setDietaryOpen(false)}
                        className="fixed inset-0 z-20 cursor-default"
                      />
                      <div className="absolute right-0 top-full z-30 mt-2 w-72 space-y-3 rounded-card border border-sand bg-surface-elevated p-3 shadow-card">
                        <DietaryFilter
                          available={availableTags}
                          selected={activeTags}
                          onToggle={toggleTag}
                        />
                        <DietaryDisclaimer />
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* ============ Body: inner-capped grid (MENU view — menu · cart rail) ============ */}
        {!isLanding ? (
        <div
          id="menu-top"
          className="mx-auto w-full max-w-[1440px] 2xl:max-w-[1680px] scroll-mt-[124px] px-5 lg:grid lg:grid-cols-[1fr_336px] lg:items-start lg:gap-[30px] lg:px-6 lg:pt-7"
        >
          <div className="min-w-0">
            {/* AI ordering concierge (#12). Proposes items; tapping one routes
                through setActiveItem -> ItemModifierSheet -> addItem, exactly like
                the menu tiles, never a direct cart write. The CartRail nudge links
                here via #concierge. */}
            {conciergeEnabled && menu.length > 0 ? (
              <ConciergeLauncher
                slug={venue.slug}
                menu={menu}
                onSelectItem={setActiveItem}
                onOpenCart={() => setCartOpen(true)}
                prefill={conciergePrefill}
                onOpenConcierge={openConcierge}
              />
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
                    <ul className="mt-3 space-y-3 lg:grid lg:grid-cols-3 lg:gap-3 lg:space-y-0 2xl:grid-cols-4">
                      {category.items.map((item) => (
                        <li key={item.id}>
                          <ItemCard
                            item={item}
                            onSelect={setActiveItem}
                            onQuickAdd={(quick) =>
                              addItem(quick.id, null, [], 1)
                            }
                          />
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
              onAskConcierge={openConcierge}
              onSelectItem={setActiveItem}
            />
          ) : null}
        </div>
        ) : null}

        {/* Footer — opening hours, location, contact + the logo (end of page). */}
        <StorefrontFooter venue={venue} faqs={faqs} />

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

function CartIcon() {
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
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
      <path d="M2.5 3h2l2.2 12.2a1.5 1.5 0 0 0 1.5 1.3h8.6a1.5 1.5 0 0 0 1.5-1.2L21.5 7H6" />
    </svg>
  );
}

function SlidersIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
    >
      <path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h8M16 18h4" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="8" cy="12" r="2" />
      <circle cx="14" cy="18" r="2" />
    </svg>
  );
}
