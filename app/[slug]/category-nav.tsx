"use client";

import { useEffect, useState } from "react";

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
    return (
      <nav className="min-w-0">
        <ul className="flex gap-6 overflow-x-auto">
          {categories.map((category) => {
            const isActive = category.id === active;
            return (
              <li key={category.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => handleClick(category.id)}
                  aria-current={isActive ? "true" : undefined}
                  className={`relative border-b-[3px] py-4 text-sm font-semibold transition ${
                    isActive
                      ? "text-ink"
                      : "border-transparent text-muted hover:text-ink"
                  }`}
                  style={
                    isActive ? { borderColor: "var(--action)" } : undefined
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
