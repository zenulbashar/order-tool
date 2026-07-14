"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Category nav with scroll-spy. Rendered inside the storefront's sticky header
 * (which sits below the search box and owns the stickiness), so this element is
 * not sticky itself. Each category section carries an `id`; an
 * IntersectionObserver highlights the section nearest the top, and clicking a
 * chip smooth-scrolls to it. The `rootMargin` top inset matches the sticky
 * header height so a section becomes active as its heading clears the header.
 * The active chip uses the venue's brand colour (a runtime CSS variable), so
 * styling is inline rather than a class.
 */
export function CategoryNav({
  categories,
  variant = "pills",
}: {
  categories: { id: string; name: string }[];
  // "pills" — the mobile chip row (default). "tabs" — the desktop underline strip
  // (active tab = ink text + a 3px brand underline), used in the storefront's
  // sticky desktop tab strip. Both share the same scroll-spy behaviour.
  variant?: "pills" | "tabs";
}) {
  const [active, setActive] = useState(categories[0]?.id ?? "");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          );
        if (visible[0]) setActive(visible[0].target.id);
      },
      // Trigger when a section's top passes just below the sticky header
      // (search box + chip row, ~109px). Keep this in step with the section
      // scroll-mt-32 (128px) so the active chip flips as a heading clears it.
      { rootMargin: "-120px 0px -70% 0px", threshold: 0 },
    );

    for (const category of categories) {
      const el = document.getElementById(category.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [categories]);

  function handleClick(id: string) {
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (variant === "tabs") {
    return <CategoryTabs categories={categories} active={active} onPick={handleClick} />;
  }

  return (
    <nav>
      <ul className="flex gap-1 overflow-x-auto px-3 py-2">
        {categories.map((category) => {
          const isActive = category.id === active;
          return (
            <li key={category.id} className="shrink-0">
              <button
                type="button"
                onClick={() => handleClick(category.id)}
                className={`inline-flex min-h-11 items-center rounded-pill border px-4 text-sm font-medium transition ${
                  isActive
                    ? "text-[var(--action-contrast)]"
                    : "border-sand bg-surface-elevated text-muted hover:bg-sand"
                }`}
                style={
                  isActive
                    ? {
                        backgroundColor: "var(--action)",
                        borderColor: "var(--action)",
                      }
                    : undefined
                }
              >
                {category.name}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Desktop tab strip (underline variant) with mouse-friendly scroll arrows. The
 * strip pans horizontally and its scrollbar is hidden; on a touchscreen you
 * swipe, but a MOUSE user had no way to reach categories scrolled off the right.
 * The ‹ › buttons appear only when there's more in that direction and scroll the
 * strip a chunk at a time. A gradient fade under each arrow masks the tabs so
 * they don't read as clipped.
 */
function CategoryTabs({
  categories,
  active,
  onPick,
}: {
  categories: { id: string; name: string }[];
  active: string;
  onPick: (id: string) => void;
}) {
  const scrollerRef = useRef<HTMLUListElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const updateArrows = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 1);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    // rAF for the initial read so we're not setting state synchronously in the
    // effect body; scroll + resize keep it current thereafter.
    const raf = requestAnimationFrame(updateArrows);
    el.addEventListener("scroll", updateArrows, { passive: true });
    const observer = new ResizeObserver(updateArrows);
    observer.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", updateArrows);
      observer.disconnect();
    };
  }, [updateArrows, categories]);

  const scrollByChunk = (direction: number) => {
    scrollerRef.current?.scrollBy({ left: direction * 240, behavior: "smooth" });
  };

  return (
    <nav className="relative min-w-0">
      {!atStart ? (
        <ArrowButton side="left" onClick={() => scrollByChunk(-1)} />
      ) : null}
      <ul
        ref={scrollerRef}
        className="flex gap-6 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {categories.map((category) => {
          const isActive = category.id === active;
          return (
            <li key={category.id} className="shrink-0">
              <button
                type="button"
                onClick={() => onPick(category.id)}
                aria-current={isActive ? "true" : undefined}
                className={`relative border-b-[3px] py-4 text-sm font-semibold transition ${
                  isActive
                    ? "text-ink"
                    : "border-transparent text-muted hover:text-ink"
                }`}
                style={isActive ? { borderColor: "var(--action)" } : undefined}
              >
                {category.name}
              </button>
            </li>
          );
        })}
      </ul>
      {!atEnd ? (
        <ArrowButton side="right" onClick={() => scrollByChunk(1)} />
      ) : null}
    </nav>
  );
}

function ArrowButton({
  side,
  onClick,
}: {
  side: "left" | "right";
  onClick: () => void;
}) {
  return (
    <div
      className={`pointer-events-none absolute inset-y-0 z-10 flex items-center ${
        side === "left"
          ? "left-0 bg-gradient-to-r from-surface via-surface to-transparent pr-8"
          : "right-0 bg-gradient-to-l from-surface via-surface to-transparent pl-8"
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        aria-label={
          side === "left" ? "Scroll categories left" : "Scroll categories right"
        }
        className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface-elevated text-ink shadow-sm transition hover:bg-hover-secondary"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          aria-hidden="true"
        >
          {side === "left" ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
        </svg>
      </button>
    </div>
  );
}
