/**
 * Kitchen-board status transitions (pure).
 *
 * The board polls every ~12s and every device can move a card, so a status
 * write must say which status it believed it was moving FROM — a compare-and-
 * set — or a stale device silently regresses another device's hand-off. The
 * customer "ready" notification is likewise a property of the TRANSITION, not
 * of the target: "Back to ready" from Completed is a correction, not a second
 * pickup call.
 */

export const FULFILLMENT_STATUSES = [
  "new",
  "preparing",
  "ready",
  "completed",
] as const;
export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number];

const ORDER: Record<FulfillmentStatus, number> = {
  new: 0,
  preparing: 1,
  ready: 2,
  completed: 3,
};

/**
 * Tell the customer their order is ready only when it ADVANCES into `ready`
 * from an earlier stage. Moving back to ready from completed (a mis-tap
 * correction), or re-affirming ready, sends nothing.
 */
export function shouldNotifyReady(
  from: FulfillmentStatus,
  to: FulfillmentStatus,
): boolean {
  return to === "ready" && ORDER[from] < ORDER.ready;
}
