"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * Storefront menu search. Fully controlled by the storefront: value + onChange +
 * resultCount drive the query, and expanded + onExpand + onCollapse drive whether
 * it shows as a compact ICON or a full-width INPUT. It owns no filter logic, so
 * search.ts and the storefront's query state stay untouched.
 *
 * Compact by default: a labelled search ICON button; tapping it asks the parent
 * to expand into the full-width input (focused on open), which collapses back to
 * the icon when left empty (blur) or on Esc. The parent keeps it open whenever a
 * query is present.
 * Brand-themed focus uses the venue's --brand inline (a CSS variable can't live
 * in a static class). Accessible: role=search, a visually-hidden input label, a
 * labelled expand control, a clearable input (button + Esc), and a polite live
 * region announcing the result count. Pure view — never touches cart or menu.
 */
export function MenuSearch({
  value,
  onChange,
  resultCount,
  expanded,
  onExpand,
  onCollapse,
}: {
  value: string;
  onChange: (next: string) => void;
  /** Number of matching items while searching, or null when the box is empty. */
  resultCount: number | null;
  /** Whether the search is expanded into its full-width input (parent-owned). */
  expanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [triggerFocused, setTriggerFocused] = useState(false);
  const hasQuery = value.length > 0;
  const trimmed = value.trim();

  // Focus the input whenever it expands open, so the icon → input is one tap.
  useEffect(() => {
    if (expanded) inputRef.current?.focus();
  }, [expanded]);

  return (
    <div role="search" className={expanded ? "w-full" : "shrink-0"}>
      <label htmlFor={inputId} className="sr-only">
        Search the menu
      </label>

      {expanded ? (
        <div className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted"
          >
            <SearchIcon />
          </span>

          <input
            id={inputId}
            ref={inputRef}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              // Collapse back to the icon only when nothing was typed.
              if (value.length === 0) onCollapse();
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onChange("");
                onCollapse();
              }
            }}
            placeholder="Search the menu"
            className="w-full rounded-pill border border-sand bg-surface-elevated py-2.5 pl-9 pr-9 text-sm text-ink shadow-sm outline-none placeholder:text-muted"
            style={
              focused
                ? {
                    borderColor: "var(--action)",
                    boxShadow: "0 0 0 1px var(--action)",
                  }
                : undefined
            }
          />

          {hasQuery ? (
            <button
              type="button"
              onClick={() => {
                onChange("");
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="absolute inset-y-0 right-1.5 flex items-center rounded-control px-2 text-muted transition hover:text-ink"
            >
              <CloseIcon />
            </button>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={onExpand}
          onFocus={() => setTriggerFocused(true)}
          onBlur={() => setTriggerFocused(false)}
          aria-label="Search the menu"
          aria-expanded={false}
          aria-controls={inputId}
          className="flex h-11 w-11 items-center justify-center rounded-pill border border-sand bg-surface-elevated text-muted shadow-sm outline-none transition hover:text-ink"
          style={
            triggerFocused
              ? {
                  borderColor: "var(--action)",
                  boxShadow: "0 0 0 1px var(--action)",
                  color: "var(--action)",
                }
              : undefined
          }
        >
          <SearchIcon />
        </button>
      )}

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

function SearchIcon() {
  return (
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
  );
}

function CloseIcon() {
  return (
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
  );
}
