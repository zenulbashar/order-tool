"use client";

import {
  DIETARY_DISCLAIMER,
  type DietaryTag,
  dietaryTagLabel,
} from "@/lib/validation";

/**
 * Storefront dietary/allergen filter. Renders ONLY the tags actually in use
 * across this venue's menu (no dead chips) as toggleable, brand-themed chips,
 * controlled by the storefront (selected + onToggle). Filtering is AND: an item
 * must carry every selected tag (the storefront applies that predicate).
 *
 * LIFE-SAFETY: tags are the venue's own labels, not platform guarantees, so the
 * mandatory confirm-with-the-venue disclaimer is shown PROMINENTLY here (a
 * tinted, bordered note — not a faint caption) right where a customer narrows
 * the menu by dietary need.
 */
export function DietaryFilter({
  available,
  selected,
  onToggle,
}: {
  available: DietaryTag[];
  selected: DietaryTag[];
  onToggle: (tag: DietaryTag) => void;
}) {
  if (available.length === 0) return null;

  const selectedSet = new Set(selected);

  return (
    <div className="space-y-2">
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Filter the menu by dietary tags"
      >
        {available.map((tag) => {
          const isActive = selectedSet.has(tag);
          return (
            <button
              key={tag}
              type="button"
              aria-pressed={isActive}
              onClick={() => onToggle(tag)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                isActive
                  ? "border-transparent text-white"
                  : "border-sand bg-surface-elevated text-ink hover:bg-sand"
              }`}
              style={
                isActive ? { backgroundColor: "var(--brand)" } : undefined
              }
            >
              {dietaryTagLabel(tag)}
            </button>
          );
        })}
      </div>
      <p className="flex items-start gap-2 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-xs font-medium text-ink">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
          className="mt-px h-4 w-4 shrink-0 text-accent"
        >
          <path
            fillRule="evenodd"
            d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z"
            clipRule="evenodd"
          />
        </svg>
        <span>{DIETARY_DISCLAIMER}</span>
      </p>
    </div>
  );
}
