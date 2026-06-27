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

/** One item line on a "favourite" card, from the immutable order snapshots. */
export type RecentOrderItem = {
  name: string;
  // Chosen size for a variant-priced line (snapshot), else null.
  variantName: string | null;
  quantity: number;
  // Add-on / modifier names in stored order, e.g. ["Oat Milk", "Single Shot"].
  modifierNames: string[];
};

/**
 * A recent order rendered as a prominent quick-reorder "favourite" card at the
 * top of the account view. Same IDOR-safe, session-scoped, snapshot-only data as
 * the history list — just carrying each line's add-ons + the order notes for the
 * richer card. Reorder reuses the existing ids-only action (re-prices live).
 */
export type RecentCustomerOrder = {
  publicToken: string;
  status: "pending_payment" | "confirmed" | "cancelled" | "payment_failed";
  orderType: "pickup" | "dine_in";
  totalCents: number;
  createdAt: Date;
  notes: string | null;
  items: RecentOrderItem[];
};
