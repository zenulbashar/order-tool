"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";

import type { PublicMenu } from "./types";

/**
 * Cart state lives entirely on the client and is persisted to sessionStorage,
 * keyed by slug. We store ONLY ids + quantity per line — the chosen size variant
 * id, the item id, and the modifier option ids — never prices. All money shown
 * is recomputed here from the current menu for display, and will be recomputed
 * server-side at order time (price-tampering defence).
 *
 * sessionStorage is a client-only external store, so it is read through
 * useSyncExternalStore — hydration-safe (server snapshot is always empty) and
 * without a setState-in-effect load.
 */

/**
 * Persisted shape — the minimum needed to rebuild a line. No prices. variantId
 * is the chosen size for a variant-priced item, or null for a flat-priced one.
 */
type StoredLine = {
  itemId: string;
  variantId: string | null;
  selectedOptionIds: string[];
  quantity: number;
};

/** In-memory line: a StoredLine plus its derived identity. */
export type CartLine = StoredLine & { lineId: string };

/** A line resolved against the current menu, ready to render. */
export type DisplayLine = {
  lineId: string;
  itemId: string;
  itemName: string;
  // Chosen size's name for a variant-priced line (e.g. "Large"), else null.
  variantName: string | null;
  quantity: number;
  options: { id: string; name: string; priceDeltaCents: number }[];
  unitCents: number;
  lineCents: number;
};

type CartApi = {
  lines: CartLine[];
  displayLines: DisplayLine[];
  count: number;
  subtotalCents: number;
  /** True when the last load dropped/changed stale lines; cleared on mutation. */
  staleNotice: boolean;
  addItem: (
    itemId: string,
    variantId: string | null,
    selectedOptionIds: string[],
    quantity: number,
  ) => void;
  setQuantity: (lineId: string, quantity: number) => void;
  removeLine: (lineId: string) => void;
  clear: () => void;
};

const MAX_QTY = 99;

/* -------------------------------------------------------------------------- */
/* Menu index + pure cart helpers                                             */
/* -------------------------------------------------------------------------- */

type MenuIndex = {
  items: Map<string, { name: string; priceCents: number }>;
  options: Map<string, { name: string; priceDeltaCents: number }>;
  itemOptionIds: Map<string, Set<string>>;
  // Variant price/name by variant id, and the set of valid variant ids per item.
  // An item with a non-empty set here is variant-priced; an empty set is flat.
  variants: Map<string, { name: string; priceCents: number }>;
  itemVariantIds: Map<string, Set<string>>;
};

function buildIndex(menu: PublicMenu): MenuIndex {
  const items = new Map<string, { name: string; priceCents: number }>();
  const options = new Map<string, { name: string; priceDeltaCents: number }>();
  const itemOptionIds = new Map<string, Set<string>>();
  const variants = new Map<string, { name: string; priceCents: number }>();
  const itemVariantIds = new Map<string, Set<string>>();

  for (const category of menu) {
    for (const item of category.items) {
      items.set(item.id, { name: item.name, priceCents: item.priceCents });
      const ids = new Set<string>();
      for (const group of item.groups) {
        for (const option of group.options) {
          options.set(option.id, {
            name: option.name,
            priceDeltaCents: option.priceDeltaCents,
          });
          ids.add(option.id);
        }
      }
      itemOptionIds.set(item.id, ids);
      const variantIds = new Set<string>();
      for (const variant of item.variants) {
        variants.set(variant.id, {
          name: variant.name,
          priceCents: variant.priceCents,
        });
        variantIds.add(variant.id);
      }
      itemVariantIds.set(item.id, variantIds);
    }
  }
  return { items, options, itemOptionIds, variants, itemVariantIds };
}

/**
 * Order-independent identity so the same item + size + options merges into one
 * line, while different sizes (e.g. Small vs Large) stay distinct lines.
 */
function lineKey(
  itemId: string,
  variantId: string | null,
  optionIds: string[],
): string {
  return `${itemId}__${variantId ?? ""}__${[...optionIds].sort().join("-")}`;
}

function mergeLines(lines: CartLine[]): CartLine[] {
  const byKey = new Map<string, CartLine>();
  for (const line of lines) {
    const existing = byKey.get(line.lineId);
    if (existing) {
      existing.quantity = Math.min(MAX_QTY, existing.quantity + line.quantity);
    } else {
      byKey.set(line.lineId, { ...line });
    }
  }
  return [...byKey.values()];
}

function addToLines(
  prev: CartLine[],
  itemId: string,
  variantId: string | null,
  optionIds: string[],
  quantity: number,
): CartLine[] {
  const id = lineKey(itemId, variantId, optionIds);
  const existing = prev.find((line) => line.lineId === id);
  if (existing) {
    return prev.map((line) =>
      line.lineId === id
        ? { ...line, quantity: Math.min(MAX_QTY, line.quantity + quantity) }
        : line,
    );
  }
  return [
    ...prev,
    { lineId: id, itemId, variantId, selectedOptionIds: optionIds, quantity },
  ];
}

function setLineQuantity(
  prev: CartLine[],
  lineId: string,
  quantity: number,
): CartLine[] {
  if (quantity <= 0) return prev.filter((line) => line.lineId !== lineId);
  return prev.map((line) =>
    line.lineId === lineId
      ? { ...line, quantity: Math.min(MAX_QTY, quantity) }
      : line,
  );
}

function computeDisplay(lines: CartLine[], index: MenuIndex) {
  const displayLines: DisplayLine[] = [];
  let subtotalCents = 0;
  let count = 0;
  for (const line of lines) {
    const item = index.items.get(line.itemId);
    if (!item) continue; // defensive; reconciled at read

    // Variant-priced lines take the chosen size's price as the base; flat lines
    // use the item price. Display only — the server re-prices at order time from
    // its own DB lookup and never trusts this number.
    let baseCents = item.priceCents;
    let variantName: string | null = null;
    if (line.variantId) {
      const variant = index.variants.get(line.variantId);
      if (!variant) continue; // defensive; reconciled at read
      baseCents = variant.priceCents;
      variantName = variant.name;
    }

    const options = line.selectedOptionIds
      .map((id) => {
        const option = index.options.get(id);
        return option ? { id, ...option } : null;
      })
      .filter((o): o is NonNullable<typeof o> => o !== null);
    const unitCents =
      baseCents + options.reduce((sum, o) => sum + o.priceDeltaCents, 0);
    const lineCents = unitCents * line.quantity;
    subtotalCents += lineCents;
    count += line.quantity;
    displayLines.push({
      lineId: line.lineId,
      itemId: line.itemId,
      itemName: item.name,
      variantName,
      quantity: line.quantity,
      options,
      unitCents,
      lineCents,
    });
  }
  return { displayLines, subtotalCents, count };
}

/* -------------------------------------------------------------------------- */
/* sessionStorage-backed external store                                       */
/* -------------------------------------------------------------------------- */

const storageKey = (slug: string) => `cart:${slug}`;

/**
 * Defensive read: sessionStorage is user-writable and may be stale. Validate
 * the JSON shape, drop lines whose item is unknown, filter out option ids that
 * no longer exist/are unavailable, clamp quantity, and on ANY failure fall back
 * to an empty cart. The storefront must never white-screen on bad local data.
 * Returns the cleaned lines and whether anything was dropped/changed.
 */
function readStoredCart(
  slug: string,
  index: MenuIndex,
): { lines: CartLine[]; changed: boolean } {
  try {
    const raw = sessionStorage.getItem(storageKey(slug));
    if (!raw) return { lines: [], changed: false };

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { lines: [], changed: false };

    let changed = false;
    const cleaned: CartLine[] = [];

    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") {
        changed = true;
        continue;
      }
      const { itemId, variantId, selectedOptionIds, quantity } = entry as Record<
        string,
        unknown
      >;

      if (typeof itemId !== "string" || !index.items.has(itemId)) {
        changed = true; // unknown / removed / unavailable item -> drop line
        continue;
      }

      // Reconcile the chosen size against the live menu. A variant-priced item
      // REQUIRES a currently-valid size: if the item gained variants since this
      // line was stored, or the chosen size was removed/renamed, drop the line —
      // we never silently pick a size for the customer. A now-flat item drops any
      // stale size it used to carry. Either way the "items changed" notice fires.
      const itemVariantIds =
        index.itemVariantIds.get(itemId) ?? new Set<string>();
      const rawVariantId = typeof variantId === "string" ? variantId : null;
      let resolvedVariantId: string | null = null;
      if (itemVariantIds.size > 0) {
        if (rawVariantId && itemVariantIds.has(rawVariantId)) {
          resolvedVariantId = rawVariantId;
        } else {
          changed = true; // missing/invalid size on a variant-priced item
          continue;
        }
      } else if (rawVariantId !== null) {
        changed = true; // stale size on a now-flat item -> strip it
      }

      const validIds = index.itemOptionIds.get(itemId) ?? new Set<string>();
      const rawIds = Array.isArray(selectedOptionIds) ? selectedOptionIds : [];
      const ids = rawIds.filter(
        (id): id is string => typeof id === "string" && validIds.has(id),
      );
      if (ids.length !== rawIds.length) changed = true; // some options gone

      let qty = 1;
      if (
        typeof quantity === "number" &&
        Number.isInteger(quantity) &&
        quantity > 0
      ) {
        qty = Math.min(quantity, MAX_QTY);
      } else {
        changed = true; // missing/invalid quantity -> default to 1
      }

      cleaned.push({
        lineId: lineKey(itemId, resolvedVariantId, ids),
        itemId,
        variantId: resolvedVariantId,
        selectedOptionIds: ids,
        quantity: qty,
      });
    }

    const merged = mergeLines(cleaned);
    if (merged.length !== cleaned.length) changed = true;
    return { lines: merged, changed };
  } catch {
    // Malformed JSON or storage access error -> safe empty cart.
    return { lines: [], changed: false };
  }
}

function persist(slug: string, lines: CartLine[]) {
  try {
    const stored: StoredLine[] = lines.map(
      ({ itemId, variantId, selectedOptionIds, quantity }) => ({
        itemId,
        variantId,
        selectedOptionIds,
        quantity,
      }),
    );
    sessionStorage.setItem(storageKey(slug), JSON.stringify(stored));
  } catch {
    // Storage unavailable/quota — the cart still works in-memory this session.
  }
}

/**
 * Seed the slug's persisted cart with a set of lines, REPLACING whatever's
 * there. Used by reorder (#7): it writes the SAME ids-only shape the cart
 * already stores (no prices), so when a fresh CartProvider mounts on the next
 * navigation, readStoredCart() reconciles them against the live menu (dropping
 * unavailable items, raising the stale notice) and checkout re-prices — exactly
 * like a returning customer's saved cart. Additive: the store, readStoredCart,
 * and persist are unchanged.
 */
export function seedStoredCart(slug: string, lines: StoredLine[]): void {
  try {
    const stored: StoredLine[] = lines.map(
      ({ itemId, variantId, selectedOptionIds, quantity }) => ({
        itemId,
        variantId,
        selectedOptionIds,
        quantity,
      }),
    );
    sessionStorage.setItem(storageKey(slug), JSON.stringify(stored));
  } catch {
    // Storage unavailable — reorder simply won't pre-fill; never fatal.
  }
}

type CartState = { lines: CartLine[]; stale: boolean };
const EMPTY_STATE: CartState = { lines: [], stale: false };

function createCartStore(slug: string, index: MenuIndex) {
  let state: CartState = EMPTY_STATE;
  let initialized = false;
  const listeners = new Set<() => void>();

  function ensureInit() {
    if (initialized) return;
    initialized = true;
    const { lines, changed } = readStoredCart(slug, index);
    if (lines.length > 0 || changed) state = { lines, stale: changed };
  }

  return {
    subscribe(listener: () => void) {
      ensureInit();
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot(): CartState {
      ensureInit();
      return state;
    },
    getServerSnapshot(): CartState {
      return EMPTY_STATE;
    },
    update(updater: (prev: CartLine[]) => CartLine[]) {
      ensureInit();
      const next = updater(state.lines);
      state = { lines: next, stale: false };
      persist(slug, next);
      for (const listener of listeners) listener();
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Provider                                                                   */
/* -------------------------------------------------------------------------- */

const CartContext = createContext<CartApi | null>(null);

export function useCart(): CartApi {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider.");
  return ctx;
}

export function CartProvider({
  slug,
  menu,
  children,
}: {
  slug: string;
  menu: PublicMenu;
  children: React.ReactNode;
}) {
  const index = useMemo(() => buildIndex(menu), [menu]);
  const store = useMemo(() => createCartStore(slug, index), [slug, index]);
  const state = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  const lines = state.lines;

  const addItem = useCallback(
    (itemId: string, variantId: string | null, ids: string[], qty: number) =>
      store.update((prev) => addToLines(prev, itemId, variantId, ids, qty)),
    [store],
  );
  const setQuantity = useCallback(
    (lineId: string, qty: number) =>
      store.update((prev) => setLineQuantity(prev, lineId, qty)),
    [store],
  );
  const removeLine = useCallback(
    (lineId: string) => store.update((prev) => prev.filter((l) => l.lineId !== lineId)),
    [store],
  );
  const clear = useCallback(() => store.update(() => []), [store]);

  const derived = useMemo(() => computeDisplay(lines, index), [lines, index]);

  const api = useMemo<CartApi>(
    () => ({
      lines,
      displayLines: derived.displayLines,
      count: derived.count,
      subtotalCents: derived.subtotalCents,
      staleNotice: state.stale,
      addItem,
      setQuantity,
      removeLine,
      clear,
    }),
    [lines, derived, state.stale, addItem, setQuantity, removeLine, clear],
  );

  return <CartContext.Provider value={api}>{children}</CartContext.Provider>;
}
