"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * Storefront menu search. Controlled by the storefront (value + onChange +
 * resultCount) — this component owns ONLY its collapsed/expanded presentation,
 * so the filter logic (search.ts) and the storefront stay untouched.
 *
 * Compact by default: a labelled search ICON button that expands into the input
 * on click and collapses back to the icon when the input is left empty (Esc
 * clears + collapses). A non-empty query always keeps the input visible.
 * Brand-themed focus uses the venue's --brand inline (a CSS variable can't live
 * in a static class). Accessible: role=search, a visually-hidden input label, a
 * labelled expand control, a clearable input (button + Esc), and a polite live
 * region announcing the result count. Pure view — never touches cart or menu.
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [focused, setFocused] = useState(false);
  const [triggerFocused, setTriggerFocused] = useState(false);
  const hasQuery = value.length > 0;
  const trimmed = value.trim();
  // A non-empty query is always shown so the input never hides what was typed.
  const showInput = expanded || hasQuery;

  // Focus the input whenever it expands open, so the icon → input is one tap.
  useEffect(() => {
    if (expanded) inputRef.current?.focus();
  }, [expanded]);

  return (
    <div role="search">
      <label htmlFor={inputId} className="sr-only">
        Search the menu
      </label>

      {showInput ? (
        <div className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400"
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
              if (value.length === 0) setExpanded(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape" && (hasQuery || expanded)) {
                event.preventDefault();
                onChange("");
                setExpanded(false);
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
              onClick={() => {
                onChange("");
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="absolute inset-y-0 right-1.5 flex items-center rounded px-1 text-gray-400 transition hover:text-gray-600"
            >
              <CloseIcon />
            </button>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          onFocus={() => setTriggerFocused(true)}
          onBlur={() => setTriggerFocused(false)}
          aria-label="Search the menu"
          aria-expanded={false}
          aria-controls={inputId}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-gray-300 text-gray-500 shadow-sm outline-none transition hover:text-gray-900"
          style={
            triggerFocused
              ? {
                  borderColor: "var(--brand)",
                  boxShadow: "0 0 0 1px var(--brand)",
                  color: "var(--brand)",
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
