"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { Button } from "@/app/_components/button";
import { cx } from "@/app/_components/cx";
import { Select } from "@/app/_components/select";

import {
  connectSquare,
  disconnectSquare,
  mapSquareLocation,
  setSquareMirroring,
} from "./actions";
import { SquareLogo } from "./integration-card";

/**
 * The live Square connector card — the design's "one anatomy, four states"
 * (P2E-Owner extension), driven by real venue_integrations state. Connect is
 * forest, never amber (the design's own rule); errors use the warm/coral
 * tones. Only SAFE fields reach this client component — token columns never
 * leave the server.
 */
export type SquareCardData = {
  state:
    | "not_connected"
    | "pick_location"
    | "connected"
    | "paused"
    | "revoked";
  locationName: string | null;
  venueName: string;
  lastMirroredAgo: string | null;
  attentionCount: number;
  /** Present only while picking/re-mapping a location. */
  locations: { id: string; name: string }[] | null;
  remapHref: string;
  detailHref: string;
  /** Sandbox env — surfaces the "open a test-account dashboard first" hint. */
  sandbox: boolean;
};

export function SquareCard({ data }: { data: SquareCardData }) {
  const [isPending, startTransition] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);

  const header = (
    <div className="flex items-start gap-2.5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-forest">
        <SquareLogo />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-display text-[15px] font-extrabold tracking-tight text-ink">
            Square
          </span>
          <span className="rounded-[5px] bg-sand px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider text-muted">
            POS
          </span>
        </div>
        <p className="mt-0.5 text-[11px] text-muted">
          Orders mirrored into your register
        </p>
      </div>
      {data.state === "connected" || data.state === "paused" ? (
        <>
          <span
            className={cx(
              "inline-flex shrink-0 items-center gap-1.5 rounded-pill px-2 py-1 text-[10px] font-bold",
              data.state === "connected"
                ? "bg-[var(--color-success)]/12 text-success-deep"
                : "bg-sand text-muted",
            )}
          >
            <span
              className={cx(
                "h-1.5 w-1.5 rounded-full",
                data.state === "connected"
                  ? "bg-[var(--color-success)]"
                  : "bg-line-strong",
              )}
            />
            {data.state === "connected" ? "Connected" : "Paused"}
          </span>
          <button
            type="button"
            aria-label="Square options"
            onClick={() => setMenuOpen((open) => !open)}
            className="shrink-0 rounded-control px-1 text-base leading-none text-ink hover:bg-sand"
          >
            ⋯
          </button>
        </>
      ) : null}
    </div>
  );

  return (
    <div className="relative flex flex-col gap-2.5 rounded-card border border-line bg-surface-elevated p-4 shadow-card">
      {header}

      {/* Overflow menu (design: Pause / Re-map / Disconnect) */}
      {menuOpen ? (
        <div className="absolute right-3 top-11 z-10 w-48 rounded-input border border-line bg-surface-elevated p-1 shadow-lift">
          <form action={setSquareMirroring}>
            {data.state === "paused" ? (
              <input type="hidden" name="enable" value="on" />
            ) : null}
            <button
              type="submit"
              className="block w-full rounded-[8px] px-2.5 py-2 text-left text-xs font-semibold text-ink hover:bg-hover-secondary"
            >
              {data.state === "paused" ? "Resume mirroring" : "Pause mirroring"}
            </button>
          </form>
          <Link
            href={data.remapHref}
            className="block rounded-[8px] px-2.5 py-2 text-xs font-semibold text-ink hover:bg-hover-secondary"
            onClick={() => setMenuOpen(false)}
          >
            Re-map location
          </Link>
          <div className="mx-1.5 my-1 h-px bg-hover-ghost" />
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              if (
                window.confirm(
                  "Disconnect Square? Mirroring stops; no menu or order data is deleted.",
                )
              ) {
                startTransition(async () => {
                  await disconnectSquare();
                });
              }
            }}
            className="block w-full rounded-[8px] px-2.5 py-2 text-left text-xs font-semibold text-error hover:bg-hover-secondary"
          >
            Disconnect Square
          </button>
        </div>
      ) : null}

      {data.state === "not_connected" || data.state === "revoked" ? (
        <>
          {data.state === "revoked" ? (
            <p className="rounded-control border border-[var(--color-warm)]/40 bg-[var(--color-warm)]/10 px-2.5 py-2 text-[11px] font-semibold text-ink">
              Square access was revoked — reconnect to resume mirroring.
            </p>
          ) : (
            <p className="text-xs leading-relaxed text-muted">
              Mirror every prompt2eat order into your Square register, in
              seconds.
            </p>
          )}
          <div className="mt-auto pt-1">
            <Button
              variant="primary"
              className="w-full"
              disabled={isPending}
              loading={isPending}
              loadingLabel="Opening Square…"
              onClick={() =>
                startTransition(async () => {
                  await connectSquare();
                })
              }
            >
              {data.state === "revoked" ? "Reconnect Square" : "Connect Square"}
            </Button>
            <p className="mt-1.5 text-center font-mono text-[8px] font-bold uppercase tracking-wider text-label">
              Takes ~2 min · opens Square
            </p>
            {data.sandbox ? (
              <p className="mt-2 rounded-control border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/8 px-2.5 py-2 text-[11px] leading-relaxed text-muted">
                <span className="font-semibold text-ink">Sandbox:</span> open a
                Square test-account dashboard in another tab first, or the
                authorize page shows blank.
              </p>
            ) : null}
          </div>
        </>
      ) : null}

      {data.state === "pick_location" ? (
        <form action={mapSquareLocation} className="flex flex-col gap-2">
          <p className="text-xs leading-relaxed text-muted">
            Square is connected — choose which location this venue mirrors to.
          </p>
          <label className="block">
            <span className="mb-1 block font-mono text-[9px] font-bold uppercase tracking-wider text-label">
              Location mapping
            </span>
            <Select name="locationId" required defaultValue="">
              <option value="" disabled>
                Choose a Square location…
              </option>
              {(data.locations ?? []).map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </Select>
          </label>
          <Button type="submit" variant="primary" className="w-full">
            Save mapping
          </Button>
        </form>
      ) : null}

      {data.state === "connected" || data.state === "paused" ? (
        <>
          <div>
            <p className="mb-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-label">
              Location mapping
            </p>
            <div className="flex items-center gap-2 rounded-[10px] border border-line px-2.5 py-2">
              <span className="text-xs font-semibold text-ink">
                {data.venueName}
              </span>
              <span aria-hidden="true" className="text-xs text-label">
                ↔
              </span>
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink">
                {data.locationName ?? "—"}
              </span>
              <Link
                href={data.remapHref}
                className="text-[11px] font-bold text-ink hover:opacity-80"
              >
                Edit
              </Link>
            </div>
          </div>

          {/* "Mirror orders" toggle — pause/resume, the real status flip. */}
          <form action={setSquareMirroring}>
            {data.state === "paused" ? (
              <input type="hidden" name="enable" value="on" />
            ) : null}
            <button
              type="submit"
              className="flex items-center gap-2 text-[11px] font-semibold text-ink"
              aria-pressed={data.state === "connected"}
            >
              <span
                className={cx(
                  "relative h-5 w-[34px] shrink-0 rounded-pill transition",
                  data.state === "connected" ? "bg-forest" : "bg-line",
                )}
              >
                <span
                  className={cx(
                    "absolute top-0.5 h-4 w-4 rounded-full bg-surface-elevated transition-all",
                    data.state === "connected" ? "right-0.5" : "left-0.5",
                  )}
                />
              </span>
              Mirror orders
            </button>
          </form>

          {data.lastMirroredAgo ? (
            <p className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-muted">
              <span
                aria-hidden="true"
                className={cx(
                  "h-[7px] w-[7px] rounded-full bg-[var(--color-success)]",
                  data.state === "connected" && "p2e-glow",
                )}
              />
              Last order mirrored {data.lastMirroredAgo}
            </p>
          ) : null}

          {data.attentionCount > 0 ? (
            <div className="mt-auto flex items-center gap-2 rounded-[10px] border border-[var(--color-warm)]/40 bg-[var(--color-warm)]/10 px-2.5 py-2">
              <span aria-hidden="true" className="shrink-0 text-[13px] text-warm-deep">
                ▲
              </span>
              <p className="flex-1 text-[11px] leading-snug text-ink">
                <b className="font-bold">
                  {data.attentionCount}{" "}
                  {data.attentionCount === 1 ? "order needs" : "orders need"}{" "}
                  attention
                </b>{" "}
                — mirroring failed.
              </p>
              <Link
                href={data.detailHref}
                className="shrink-0 rounded-[8px] border border-line-strong bg-surface-elevated px-2.5 py-1.5 text-[11px] font-bold text-ink hover:bg-hover-secondary"
              >
                Review
              </Link>
            </div>
          ) : (
            <Link
              href={data.detailHref}
              className="mt-auto text-[11px] font-bold text-[var(--action)] hover:opacity-80"
            >
              View activity →
            </Link>
          )}
        </>
      ) : null}
    </div>
  );
}
