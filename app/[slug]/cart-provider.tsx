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
 * keyed by slug. We store ONLY ids + quantity per line — never prices. All
 * money shown is recomputed here from the current menu for display, and will be
 * recomputed server-side at order time in 2b (price-tampering defence).
 *
 * sessionStorage is a client-only external store, so it is read through
 * useSyncExternalStore — hydration-safe (server snapshot is always empty) and
 * without a setState-in-effect load.
 */

/** Persisted shape — the minimum needed to rebuild a line. No prices. */
type StoredLine = {
  itemId: string;
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
  addItem: (itemId: string, selectedOptionIds: string[], quantity: number) => void;
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
};

function buildIndex(menu: PublicMenu): MenuIndex {
  const items = new Map<string, { name: string; priceCents: number }>();
  const options = new Map<string, { name: string; priceDeltaCents: number }>();
  const itemOptionIds = new Map<string, Set<string>>();

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
    }
  }
  return { items, options, itemOptionIds };
}

/** Order-independent identity so the same item+options merges into one line. */
function lineKey(itemId: string, optionIds: string[]): string {
  return `${itemId}__${[...optionIds].sort().join("-")}`;
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
  optionIds: string[],
  quantity: number,
): CartLine[] {
  const id = lineKey(itemId, optionIds);
  const existing = prev.find((line) => line.lineId === id);
  if (existing) {
    return prev.map((line) =>
      line.lineId === id
        ? { ...line, quantity: Math.min(MAX_QTY, line.quantity + quantity) }
        : line,
    );
  }
  return [...prev, { lineId: id, itemId, selectedOptionIds: optionIds, quantity }];
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
    const options = line.selectedOptionIds
      .map((id) => {
        const option = index.options.get(id);
        return option ? { id, ...option } : null;
      })
      .filter((o): o is NonNullable<typeof o> => o !== null);
    const unitCents =
      item.priceCents + options.reduce((sum, o) => sum + o.priceDeltaCents, 0);
    const lineCents = unitCents * line.quantity;
    subtotalCents += lineCents;
    count += line.quantity;
    displayLines.push({
      lineId: line.lineId,
      itemId: line.itemId,
      itemName: item.name,
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
      const { itemId, selectedOptionIds, quantity } = entry as Record<
        string,
        unknown
      >;

      if (typeof itemId !== "string" || !index.items.has(itemId)) {
        changed = true; // unknown / removed / unavailable item -> drop line
        continue;
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
        lineId: lineKey(itemId, ids),
        itemId,
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
      ({ itemId, selectedOptionIds, quantity }) => ({
        itemId,
        selectedOptionIds,
        quantity,
      }),
    );
    sessionStorage.setItem(storageKey(slug), JSON.stringify(stored));
  } catch {
    // Storage unavailable/quota — the cart still works in-memory this session.
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
    (itemId: string, ids: string[], qty: number) =>
      store.update((prev) => addToLines(prev, itemId, ids, qty)),
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
