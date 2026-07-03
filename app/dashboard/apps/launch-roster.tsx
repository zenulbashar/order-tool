"use client";

import { useState, useTransition } from "react";

import { createRosterHandoff } from "./actions";

/**
 * "Open Roster" launcher — the design's handoff state (P2E-Owner Apps panel).
 * On click it mints a one-time token server-side, then submits a hidden
 * cross-origin form POST (token in the BODY, target=_blank) so Roster opens in
 * a new tab and the token never touches a URL/referrer/log. While minting it
 * shows the "Opening Roster…" spinner row; on failure, a calm inline message.
 */
export function LaunchRoster({
  venueName,
  ownerName,
}: {
  venueName: string;
  ownerName: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [opened, setOpened] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open() {
    setError(null);
    startTransition(async () => {
      try {
        const { token, url } = await createRosterHandoff();
        const form = document.createElement("form");
        form.method = "POST";
        form.action = url;
        form.target = "_blank";
        form.rel = "noopener";
        const field = document.createElement("input");
        field.type = "hidden";
        field.name = "token";
        field.value = token;
        form.appendChild(field);
        document.body.appendChild(form);
        form.submit();
        form.remove();
        setOpened(true);
      } catch {
        setError(
          "We couldn't open Roster just now. Please try again in a moment.",
        );
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={open}
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-control bg-forest px-4 py-2.5 text-xs font-bold text-surface transition hover:-translate-y-px hover:shadow-lift disabled:opacity-60 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
        >
          Open Roster ↗
        </button>
        <a
          href="https://roster.zaleit.com.au"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-control border border-line-strong bg-surface-elevated px-4 py-2.5 text-xs font-bold text-ink transition hover:bg-hover-secondary"
        >
          Learn more
        </a>
      </div>

      {/* Handoff state — matches the design's "Opening Roster…" row. */}
      {isPending || opened ? (
        <div
          className="flex items-center gap-3.5 rounded-card border border-line bg-surface-elevated p-4 shadow-card"
          aria-live="polite"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-forest">
            <RosterGlyph />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-display text-sm font-extrabold tracking-tight text-ink">
                {isPending ? "Opening Roster…" : "Roster opened in a new tab"}
              </span>
              {isPending ? (
                <span
                  aria-hidden="true"
                  className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink/15 border-t-ink"
                  style={{ animationDuration: "0.8s" }}
                />
              ) : null}
            </div>
            <p className="mt-0.5 truncate text-xs text-muted">
              Signing you in as {ownerName} · {venueName} — no second password.
            </p>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="text-xs text-[var(--color-warm-deep)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** The design's Roster glyph (calendar with a check). */
function RosterGlyph() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
      className="text-surface"
    >
      <rect x="2.5" y="3.5" width="13" height="12" rx="2" />
      <path d="M2.5 7.5h13M6 2v3M12 2v3" strokeLinecap="round" />
      <path d="M5.8 11l1.6 1.6 3-3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
