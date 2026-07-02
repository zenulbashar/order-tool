/**
 * Customer-account shapes (#7). Customer-safe: snapshot fields only, scoped to
 * the signed-in customer. No venue_id, no owner data.
 */

/**
 * A line ready to seed into the cart for reorder — the SAME shape the cart
 * persists (ids only, NEVER a price). The cart's existing reconciliation
 * (readStoredCart) re-validates these against the live menu, and checkout
 * re-prices server-side, so a reorder never carries a stored/old price.
 */
export type CartSeedLine = {
  itemId: string;
  variantId: string | null;
  selectedOptionIds: string[];
  quantity: number;
};

/** One past order in the customer's history list (rendered from snapshots). */
export type CustomerOrderSummary = {
  publicToken: string;
  status: "pending_payment" | "confirmed" | "cancelled" | "payment_failed";
  orderType: "pickup" | "dine_in";
  totalCents: number;
  createdAt: Date;
  itemCount: number;
  // e.g. "2× Flat White (Large), 1× Banana Bread" — from the immutable snapshots.
  itemSummary: string;
};

/**
 * The customer's most-repeated identical order — the "YOUR USUAL" hero card.
 * Computed from the soft-ref ids of their own recent CONFIRMED orders (same
 * IDOR-safe scoping as the history list); rendered from the snapshots of the
 * newest matching order. Reorder reuses the existing ids-only action via that
 * order's publicToken, so it re-prices live like any other reorder.
 */
export type CustomerUsual = {
  // e.g. "Green Goddess Bowl + Flat White" — snapshot names of the newest
  // matching order's lines.
  title: string;
  // How many recent confirmed orders match (>= 2 by construction).
  count: number;
  // What they paid last time — display only; checkout re-prices live.
  totalCents: number;
  // Token of the newest matching order — fed to the existing reorder action.
  publicToken: string;
};
