"use client";

import { useEffect, useState } from "react";

/**
 * Slim owner-authored promo bar across the very top of the storefront (the
 * hospitality-site pattern, e.g. "Order your cake online — pick up in store").
 * Dismissible; the dismissal is remembered per venue AND per message text, so
 * changing the announcement re-shows it. Ink surface + cream text so it reads on
 * any venue theme without touching --brand. Renders nothing when there's no text.
 *
 * SSR-safe: it renders on the server (so there's no layout flash), then a mount
 * effect hides it if this exact message was already dismissed on this device.
 */
export function AnnouncementBar({
  slug,
  text,
}: {
  slug: string;
  text: string | null;
}) {
  const [dismissed, setDismissed] = useState(false);

  const key = text ? `p2e-annc:${slug}:${hash(text)}` : "";

  useEffect(() => {
    if (!text) return;
    try {
      // One-time sync from localStorage (an external store) after hydration — the
      // bar renders server-side to avoid a flash, then hides here if dismissed.
      if (localStorage.getItem(key) === "1") {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDismissed(true);
      }
    } catch {
      // Private mode / storage disabled — just keep showing it.
    }
  }, [key, text]);

  if (!text || dismissed) return null;

  return (
    <div className="relative bg-ink text-center text-[13px] font-medium text-surface">
      <p className="mx-auto max-w-[1440px] 2xl:max-w-[1680px] px-10 py-2">{text}</p>
      <button
        type="button"
        aria-label="Dismiss announcement"
        onClick={() => {
          setDismissed(true);
          try {
            localStorage.setItem(key, "1");
          } catch {
            // Non-fatal.
          }
        }}
        className="absolute inset-y-0 right-3 flex items-center text-surface/70 transition hover:text-surface"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}

/** Tiny stable string hash for the dismissal key (not security-sensitive). */
function hash(value: string): string {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) {
    h = (h << 5) - h + value.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(36);
}
