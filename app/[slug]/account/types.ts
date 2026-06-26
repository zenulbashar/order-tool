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
