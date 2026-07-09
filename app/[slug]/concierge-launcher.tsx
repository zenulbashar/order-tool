"use client";

import { useEffect } from "react";

import { ConciergePanel } from "./concierge/concierge-panel";
import type { PublicItem, PublicMenu } from "./types";

/**
 * Presents the AI concierge per the desktop design (Direction A): a floating
 * "Ask the concierge" FAB pinned bottom-right that expands into the panel. Below
 * `lg` the mobile experience is unchanged — the panel is simply rendered inline
 * (always open) in the menu column, exactly as before.
 *
 * One ConciergePanel instance serves both: the wrapper is in normal flow on
 * mobile and `lg:fixed` bottom-right on desktop, shown there only while `open`.
 * Open-state is owned by the storefront so the cart-rail nudge and the search
 * no-results handoff (prefill) can both trigger it.
 */
export function ConciergeLauncher({
  slug,
  menu,
  onSelectItem,
  onOpenCart,
  prefill,
  open,
  onOpenChange,
}: {
  slug: string;
  menu: PublicMenu;
  onSelectItem: (item: PublicItem) => void;
  onOpenCart: () => void;
  prefill?: { text: string; nonce: number };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // A prefill arriving (e.g. the search no-results "Ask the concierge instead"
  // CTA) opens the desktop overlay; on mobile the panel is inline regardless.
  useEffect(() => {
    if (prefill && prefill.nonce > 0) onOpenChange(true);
    // Only react to a new prefill request, not to onOpenChange identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill?.nonce]);

  return (
    <>
      <div
        className={`${
          open ? "block" : "block lg:hidden"
        } relative pb-2 pt-4 lg:fixed lg:bottom-24 lg:right-6 lg:z-40 lg:max-h-[72dvh] lg:w-[384px] lg:max-w-[calc(100vw-3rem)] lg:overflow-y-auto lg:rounded-card lg:p-0 lg:shadow-card`}
      >
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Close concierge"
          className="absolute right-2 top-2 z-10 hidden h-8 w-8 items-center justify-center rounded-pill bg-black/35 text-white transition hover:bg-black/50 lg:flex"
        >
          ✕
        </button>
        <ConciergePanel
          slug={slug}
          menu={menu}
          onSelectItem={onSelectItem}
          onOpenCart={onOpenCart}
          prefill={prefill}
        />
      </div>

      {/* Floating launcher — desktop only, hidden while the panel is open. */}
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className={`${
          open ? "lg:hidden" : "lg:flex"
        } fixed bottom-6 right-6 z-40 hidden items-center gap-2 rounded-pill py-3 pl-4 pr-5 text-sm font-semibold text-white shadow-lift`}
        style={{ background: "linear-gradient(110deg,#13301f,#1d4a35)" }}
      >
        <span className="flex h-[30px] w-[30px] items-center justify-center rounded-pill bg-accent/20 text-base text-accent">
          ✦
        </span>
        Ask the concierge
      </button>
    </>
  );
}
