"use client";

import { useEffect, useState } from "react";

/**
 * Sticky category nav with scroll-spy. Each category section is rendered with
 * an `id`; an IntersectionObserver highlights the section nearest the top, and
 * clicking a chip smooth-scrolls to it. The active chip uses the venue's brand
 * colour (a runtime CSS variable), so styling is inline rather than a class.
 */
export function CategoryNav({
  categories,
}: {
  categories: { id: string; name: string }[];
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
      // Trigger when a section's top passes just below the sticky nav.
      { rootMargin: "-96px 0px -70% 0px", threshold: 0 },
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

  return (
    <nav className="sticky top-0 z-20 border-b border-gray-100 bg-white/95 backdrop-blur">
      <ul className="flex gap-1 overflow-x-auto px-3 py-2">
        {categories.map((category) => {
          const isActive = category.id === active;
          return (
            <li key={category.id} className="shrink-0">
              <button
                type="button"
                onClick={() => handleClick(category.id)}
                className={`rounded-full border px-3 py-1 text-sm font-medium transition ${
                  isActive
                    ? "text-white"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
                style={
                  isActive
                    ? {
                        backgroundColor: "var(--brand)",
                        borderColor: "var(--brand)",
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
