"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { buttonStyles } from "@/app/_components/button-variants";
import { useDialog } from "@/app/_components/use-dialog";
import { formatCents } from "@/lib/validation";

import { useCart } from "./cart-provider";
import { RecommendationRow } from "./recommendation-row";
import type { PublicItem, PublicMenu, PublicRecommendations } from "./types";

/**
 * Client-side resolution of the aggregate, venue-scoped recommendation signal
 * (#11) computed server-side in queries.ts. The server ships only ids + a
 * boolean (customer-safe, tiny); here we resolve those ids to the PublicItem the
 * menu already holds, apply the in-cart exclusion + 2–4 cap, and fall back to
 * popularity when co-occurrence is thin. Every surface hides entirely when the
 * venue has too little history (hasHistory false) or fewer than MIN_SHOWN
 * candidates survive — never an empty or noisy box.
 *
 * This is read-only and completely separate from the cart/checkout money path:
 * a recommended item is never added blindly. Tapping one calls the parent's
 * onSelect, which re-opens the EXISTING item modifier sheet so any required
 * size/variant/modifier choice + pricing still happens before it enters the cart.
 */

// Show up to 4; hide the whole row below 2 — the brief's "2–4 items".
const MAX_SHOWN = 4;
const MIN_SHOWN = 2;

type RecommendationsApi = {
  /** Recommendations for a single item (the "goes well with" surface). */
  recommendForItem: (anchorId: string, inCart: Iterable<string>) => PublicItem[];
  /** Recommendations aggregated against the whole cart (the upsell surface). */
  recommendForCart: (inCart: Iterable<string>) => PublicItem[];
};

const RecommendationsContext = createContext<RecommendationsApi | null>(null);

function useRecommendations(): RecommendationsApi {
  const ctx = useContext(RecommendationsContext);
  if (!ctx) {
    throw new Error(
      "useRecommendations must be used within a RecommendationsProvider.",
    );
  }
  return ctx;
}

export function RecommendationsProvider({
  menu,
  recommendations,
  children,
}: {
  menu: PublicMenu;
  recommendations: PublicRecommendations;
  children: React.ReactNode;
}) {
  const { byItem, popular, hasHistory } = recommendations;

  // Resolve recommendation ids against the menu already in memory. The server
  // only ever returns ids that were available + active at query time; this map
  // is the same menu, so every id resolves (and a missing one is simply skipped).
  const itemsById = useMemo(() => {
    const map = new Map<string, PublicItem>();
    for (const category of menu) {
      for (const item of category.items) map.set(item.id, item);
    }
    return map;
  }, [menu]);

  const recommendForItem = useCallback(
    (anchorId: string, inCart: Iterable<string>): PublicItem[] => {
      if (!hasHistory) return [];
      const exclude = new Set(inCart);
      exclude.add(anchorId); // never recommend the item back to itself

      const picks: PublicItem[] = [];
      const seen = new Set<string>();
      const take = (id: string) => {
        if (seen.has(id) || exclude.has(id)) return;
        const item = itemsById.get(id);
        if (!item) return;
        seen.add(id);
        picks.push(item);
      };

      // Strongest co-occurrence first, then top up from popularity if thin.
      for (const id of byItem[anchorId] ?? []) {
        if (picks.length >= MAX_SHOWN) break;
        take(id);
      }
      if (picks.length < MIN_SHOWN) {
        for (const id of popular) {
          if (picks.length >= MAX_SHOWN) break;
          take(id);
        }
      }

      return picks.length >= MIN_SHOWN ? picks : [];
    },
    [byItem, popular, hasHistory, itemsById],
  );

  const recommendForCart = useCallback(
    (inCart: Iterable<string>): PublicItem[] => {
      if (!hasHistory) return [];
      const cartIds = new Set(inCart); // dedupe: one item may span several lines

      // Aggregate co-occurrence against the cart by rank points — earlier in an
      // item's partner list (stronger pair) scores higher. No raw counts cross
      // the wire, so position is all we have, which is enough to rank.
      const points = new Map<string, number>();
      for (const cartId of cartIds) {
        const partners = byItem[cartId] ?? [];
        partners.forEach((id, index) => {
          if (cartIds.has(id) || !itemsById.has(id)) return; // skip in-cart
          points.set(id, (points.get(id) ?? 0) + (partners.length - index));
        });
      }

      const popRank = new Map<string, number>();
      popular.forEach((id, index) => popRank.set(id, index));

      const ranked = [...points.entries()]
        .sort(
          (a, b) =>
            b[1] - a[1] ||
            (popRank.get(a[0]) ?? Infinity) - (popRank.get(b[0]) ?? Infinity),
        )
        .map(([id]) => id);

      // Top up from popularity when the cart yields too few co-occurrence picks.
      const seen = new Set(ranked);
      if (ranked.length < MIN_SHOWN) {
        for (const id of popular) {
          if (ranked.length >= MAX_SHOWN) break;
          if (cartIds.has(id) || seen.has(id) || !itemsById.has(id)) continue;
          seen.add(id);
          ranked.push(id);
        }
      }

      if (ranked.length < MIN_SHOWN) return [];
      return ranked
        .slice(0, MAX_SHOWN)
        .map((id) => itemsById.get(id))
        .filter((item): item is PublicItem => item !== undefined);
    },
    [byItem, popular, hasHistory, itemsById],
  );

  const api = useMemo<RecommendationsApi>(
    () => ({ recommendForItem, recommendForCart }),
    [recommendForItem, recommendForCart],
  );

  return (
    <RecommendationsContext.Provider value={api}>
      {children}
    </RecommendationsContext.Provider>
  );
}

/**
 * "Goes well with…" — the item-detail surface. Rendered inside the open modifier
 * sheet. Excludes the anchor and anything already in the cart, and hides itself
 * when there is no usable signal. onSelect re-opens the modifier sheet for the
 * chosen item so required selections + pricing are never skipped.
 */
export function ItemGoesWellWith({
  anchorId,
  onSelect,
}: {
  anchorId: string;
  onSelect: (item: PublicItem) => void;
}) {
  const { recommendForItem } = useRecommendations();
  const { lines } = useCart();
  const items = recommendForItem(
    anchorId,
    lines.map((line) => line.itemId),
  );
  return (
    <RecommendationRow title="Goes well with…" items={items} onSelect={onSelect} />
  );
}

/**
 * "Add a drink or side?" — the checkout-review surface. Aggregates co-occurrence
 * against every item in the cart, excludes what's already there, and hides when
 * thin. Same onSelect-into-the-existing-flow rule as the item surface.
 */
export function CartUpsell({
  onSelect,
}: {
  onSelect: (item: PublicItem) => void;
}) {
  const { recommendForCart } = useRecommendations();
  const { lines } = useCart();
  const items = recommendForCart(lines.map((line) => line.itemId));
  return (
    <RecommendationRow
      title="Add a drink or side?"
      items={items}
      onSelect={onSelect}
      className="mt-5 border-t border-line pt-5"
    />
  );
}

/**
 * The checkout CTA with a pre-checkout upsell interstitial. Renders as the given
 * button; on tap, if there are cart recommendations (and the customer hasn't
 * already dismissed the prompt), it opens a "anything else?" modal with those
 * add-ons before proceeding — otherwise it goes straight to checkout. Picking an
 * add-on routes through the parent's onSelectItem (the existing modifier sheet +
 * pricing), never a blind add; "Continue to checkout" always proceeds. Purely
 * client UI — it never touches the order/money path, and it can't block checkout.
 */
export function PreCheckoutUpsell({
  checkoutHref,
  subtotalCents,
  onSelectItem,
  className,
  children,
}: {
  checkoutHref: string;
  subtotalCents: number;
  onSelectItem: (item: PublicItem) => void;
  className: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const { recommendForCart } = useRecommendations();
  const { lines } = useCart();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Focus trap + initial focus + focus restoration + Escape + scroll lock.
  // Escape dismisses (matches the backdrop), so re-taps go straight to checkout.
  const panelRef = useDialog<HTMLDivElement>(() => dismiss(), open);

  const items = recommendForCart(lines.map((line) => line.itemId));

  function handleClick() {
    if (items.length > 0 && !dismissed) setOpen(true);
    else router.push(checkoutHref);
  }
  function proceed() {
    setOpen(false);
    router.push(checkoutHref);
  }
  function dismiss() {
    // Don't nag: once dismissed, subsequent checkout taps go straight through.
    setDismissed(true);
    setOpen(false);
  }
  function pick(item: PublicItem) {
    setOpen(false);
    onSelectItem(item);
  }

  return (
    <>
      <button type="button" onClick={handleClick} className={className}>
        {children}
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Anything else before you checkout?"
          onClick={dismiss}
        >
          <div
            ref={panelRef}
            className="w-full max-w-lg rounded-t-card bg-surface-elevated sm:rounded-card"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-sand px-5 py-4">
              <h2 className="font-display text-lg font-semibold tracking-tight text-ink">
                Anything else?
              </h2>
              <button
                type="button"
                onClick={dismiss}
                aria-label="Close"
                className="flex h-11 w-11 items-center justify-center rounded-pill text-muted hover:bg-sand hover:text-ink"
              >
                ✕
              </button>
            </div>
            <div className="px-5 py-4">
              <RecommendationRow
                title="Popular with your order"
                items={items}
                onSelect={pick}
              />
            </div>
            <div className="border-t border-sand px-5 py-4">
              <button
                type="button"
                onClick={proceed}
                className={buttonStyles("primary", "lg", { className: "w-full" })}
              >
                Continue to checkout · ${formatCents(subtotalCents)}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
