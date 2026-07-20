"use client";

import { useState } from "react";

import { Wordmark } from "@/app/_components/wordmark";

import { ConciergePanel } from "./concierge/concierge-panel";
import type { PublicItem, PublicMenu } from "./types";

/**
 * Presents the Prompt2Eat concierge per breakpoint:
 *  - **mobile** — the ConciergePanel renders inline with its own trigger button
 *    (its trigger is `lg:hidden`); tapping it opens the panel's modal, unchanged.
 *  - **desktop** — a floating "Not sure what to eat?" FAB (bottom-right). Clicking
 *    it opens the concierge modal DIRECTLY (via onOpenConcierge, which bumps the
 *    prefill nonce in the storefront) — no intermediate "ask" tile.
 *
 * Only ONE ConciergePanel is mounted (so a single modal), and its full-screen
 * modal is shared by both entry points.
 */
export function ConciergeLauncher({
  slug,
  menu,
  onSelectItem,
  onOpenCart,
  prefill,
  onOpenConcierge,
}: {
  slug: string;
  menu: PublicMenu;
  onSelectItem: (item: PublicItem) => void;
  onOpenCart: () => void;
  prefill?: { text: string; nonce: number };
  onOpenConcierge: () => void;
}) {
  // The panel docks bottom-right on desktop, exactly where the FAB sits — so hide
  // the FAB whenever the panel is open to avoid the overlap.
  const [panelOpen, setPanelOpen] = useState(false);

  return (
    <>
      {/* Mobile spacing only; on desktop the panel's inline trigger is hidden and
          this collapses to nothing (the modal is `fixed`, so it still works). */}
      <div className="pb-2 pt-4 lg:p-0">
        <ConciergePanel
          slug={slug}
          menu={menu}
          onSelectItem={onSelectItem}
          onOpenCart={onOpenCart}
          prefill={prefill}
          onVisibilityChange={setPanelOpen}
        />
      </div>

      <button
        type="button"
        onClick={onOpenConcierge}
        className={`fixed bottom-6 right-6 z-40 hidden items-center gap-2 rounded-pill py-3 pl-4 pr-5 text-sm font-semibold text-white shadow-lift ${
          panelOpen ? "" : "lg:flex"
        }`}
        style={{ background: "linear-gradient(110deg,#13301f,#1d4a35)" }}
      >
        <span className="flex h-[30px] w-[30px] items-center justify-center rounded-pill bg-accent/20 text-base text-accent">
          ✦
        </span>
        Not sure what to eat?
        <Wordmark className="text-accent" />
      </button>
    </>
  );
}
