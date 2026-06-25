"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { setCurrentVenue } from "./actions";

type SwitcherVenue = { id: string; name: string };

/**
 * Venue picker for owners with more than one location. Built on a native
 * <details> disclosure so it degrades gracefully: with JS off the summary still
 * toggles the panel and each venue's form still submits. The effect below only
 * *enhances* it — closing the panel on an outside click or Escape.
 *
 * Each non-active venue is a form that posts setCurrentVenue bound to that
 * venue's id. The bound id is client-controlled, so the server action
 * re-validates membership before honouring it (see app/dashboard/actions.ts).
 */
export function VenueSwitcher({
  venues,
  currentId,
}: {
  venues: SwitcherVenue[];
  currentId: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const details = ref.current;
    if (!details) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!details.contains(event.target as Node)) {
        details.open = false;
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        details.open = false;
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const currentName =
    venues.find((venue) => venue.id === currentId)?.name ?? "Select venue";

  return (
    <details ref={ref} className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-gray-900 [&::-webkit-details-marker]:hidden">
        <span className="max-w-[12rem] truncate">{currentName}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="size-4 shrink-0 text-gray-400 transition group-open:rotate-180"
        >
          <path
            fillRule="evenodd"
            d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </summary>

      <div className="absolute left-0 z-10 mt-2 w-64 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
        <p className="px-3 pt-3 pb-1 text-xs font-medium uppercase tracking-wide text-gray-400">
          Your locations
        </p>
        <ul className="pb-1">
          {venues.map((venue) => {
            const isActive = venue.id === currentId;
            if (isActive) {
              return (
                <li key={venue.id}>
                  <span className="flex items-center justify-between gap-2 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-900">
                    <span className="truncate">
                      <span className="sr-only">Current location: </span>
                      {venue.name}
                    </span>
                    <span aria-hidden="true">✓</span>
                  </span>
                </li>
              );
            }
            return (
              <li key={venue.id}>
                <form action={setCurrentVenue.bind(null, venue.id)}>
                  <button
                    type="submit"
                    className="flex w-full items-center px-3 py-2 text-left text-sm text-gray-600 transition hover:bg-gray-50 hover:text-gray-900"
                  >
                    <span className="truncate">{venue.name}</span>
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
        <Link
          href="/onboarding"
          className="block border-t border-gray-100 px-3 py-2 text-sm font-medium text-gray-500 transition hover:bg-gray-50 hover:text-gray-900"
        >
          ＋ Add another location
        </Link>
      </div>
    </details>
  );
}
