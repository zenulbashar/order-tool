"use client";

import { useId, useState } from "react";

/**
 * Storefront menu search box. Controlled by the storefront (value + onChange),
 * so clearing it restores today's full menu with no extra state to reconcile
 * here. Brand-themed focus uses the venue's --brand applied inline — the same
 * idiom as the category nav, since a CSS variable can't be expressed in a
 * static focus class. Accessible: role=search, a visually-hidden label, a
 * clearable input (button + Esc), and a polite live region announcing the
 * result count for screen readers. Pure view — it never touches cart or menu.
 */
export function MenuSearch({
  value,
  onChange,
  resultCount,
}: {
  value: string;
  onChange: (next: string) => void;
  /** Number of matching items while searching, or null when the box is empty. */
  resultCount: number | null;
}) {
  const inputId = useId();
  const [focused, setFocused] = useState(false);
  const hasQuery = value.length > 0;
  const trimmed = value.trim();

  return (
    <div role="search">
      <label htmlFor={inputId} className="sr-only">
        Search the menu
      </label>
      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="h-4 w-4"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
            />
          </svg>
        </span>

        <input
          id={inputId}
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && hasQuery) {
              event.preventDefault();
              onChange("");
            }
          }}
          placeholder="Search the menu"
          className="w-full rounded-md border border-gray-300 py-2 pl-9 pr-9 text-sm shadow-sm outline-none placeholder:text-gray-400"
          style={
            focused
              ? {
                  borderColor: "var(--brand)",
                  boxShadow: "0 0 0 1px var(--brand)",
                }
              : undefined
          }
        />

        {hasQuery ? (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Clear search"
            className="absolute inset-y-0 right-1.5 flex items-center rounded px-1 text-gray-400 transition hover:text-gray-600"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="h-4 w-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18 18 6M6 6l12 12"
              />
            </svg>
          </button>
        ) : null}
      </div>

      {/* Screen-reader-only result announcement; the visible result is the
          filtered menu itself. */}
      <p aria-live="polite" className="sr-only">
        {resultCount === null
          ? ""
          : resultCount === 0
            ? `No items match ${trimmed}.`
            : `${resultCount} ${resultCount === 1 ? "item matches" : "items match"} ${trimmed}.`}
      </p>
    </div>
  );
}
