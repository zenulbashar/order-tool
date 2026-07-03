import "server-only";

import { and, asc, eq, inArray, lt } from "drizzle-orm";

import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { db } from "@/lib/db";
import {
  type IntegrationJob,
  orderItemModifiers,
  orderItems,
  orders,
  type VenueIntegration,
  venueIntegrations,
} from "@/lib/db/schema";
import { orderReference } from "@/lib/validation";

import { SquareApiError, squareFetch } from "./client";
import { refreshAccessToken } from "./oauth";

import type { JobProcessor } from "../dispatch";

/**
 * The Square order-mirror processor (Track A). Reads ONLY the immutable
 * snapshot columns (financial truth) and pushes the order into the venue's
 * mapped Square location as ad-hoc line items + an EXTERNAL payment, which is
 * exactly what makes it appear on Square POS/Dashboard/KDS as paid (§2A:
 * visibility = fulfillment AND paid).
 *
 * Idempotency: CreateOrder uses the job id and CreatePayment the job id +
 * "-pay" as Square idempotency keys, so a retry after a partial failure
 * (order created, payment failed) resumes safely — Square returns the SAME
 * order for the same key instead of duplicating it.
 */

/** Refresh when the access token is this close to its 30-day expiry… */
const EXPIRY_MARGIN_MS = 3 * 24 * 60 * 60 * 1000;
/** …or older than Square's ≤7-day auto-refresh best practice (§2A). */
const REFRESH_CADENCE_MS = 7 * 24 * 60 * 60 * 1000;

type Money = { amount: number; currency: "AUD" };

const aud = (cents: number): Money => ({ amount: cents, currency: "AUD" });

/**
 * Decrypt (and, when stale, refresh + re-persist) the integration's access
 * token. The plaintext token exists only in the caller's scope. A refresh
 * rejected as unauthorized means the seller revoked the grant — the row is
 * marked `revoked` (tokens wiped) and the job fails with a reconnect message.
 */
async function ensureFreshAccessToken(
  integration: VenueIntegration,
): Promise<string> {
  if (!integration.accessTokenEnc || !integration.refreshTokenEnc) {
    throw new Error("Square connection is missing credentials — reconnect.");
  }

  const expiresSoon =
    !integration.tokenExpiresAt ||
    integration.tokenExpiresAt.getTime() - Date.now() < EXPIRY_MARGIN_MS;
  const refreshDue =
    !integration.tokenRefreshedAt ||
    Date.now() - integration.tokenRefreshedAt.getTime() > REFRESH_CADENCE_MS;
  if (!expiresSoon && !refreshDue) {
    return decryptSecret(integration.accessTokenEnc);
  }

  try {
    const refreshed = await refreshAccessToken(
      decryptSecret(integration.refreshTokenEnc),
    );
    await db
      .update(venueIntegrations)
      .set({
        accessTokenEnc: encryptSecret(refreshed.accessToken),
        refreshTokenEnc: encryptSecret(refreshed.refreshToken),
        tokenExpiresAt: new Date(refreshed.expiresAt),
        tokenRefreshedAt: new Date(),
      })
      .where(eq(venueIntegrations.id, integration.id));
    return refreshed.accessToken;
  } catch (error) {
    if (error instanceof SquareApiError && error.status === 401) {
      await db
        .update(venueIntegrations)
        .set({
          status: "revoked",
          accessTokenEnc: null,
          refreshTokenEnc: null,
          lastError: "Square access was revoked — reconnect from the hub.",
        })
        .where(eq(venueIntegrations.id, integration.id));
      throw new Error("Square access was revoked — reconnect from the hub.");
    }
    throw error;
  }
}

type CreateOrderResponse = {
  order: { id: string; total_money?: { amount?: number } };
};

export const mirrorOrderToSquare: JobProcessor = async (
  job: IntegrationJob,
  integration: VenueIntegration,
) => {
  if (!integration.providerLocationId) {
    throw new Error("No Square location is mapped yet — finish connecting.");
  }
  const accessToken = await ensureFreshAccessToken(integration);

  // Immutable snapshots only — never live menu rows (financial truth).
  const [order] = await db
    .select({
      id: orders.id,
      publicToken: orders.publicToken,
      orderType: orders.orderType,
      tableLabel: orders.tableLabel,
      customerName: orders.customerName,
      notes: orders.notes,
      scheduledFor: orders.scheduledFor,
      totalCents: orders.totalCents,
    })
    .from(orders)
    .where(eq(orders.id, job.orderId))
    .limit(1);
  if (!order) throw new Error("Order not found for mirror job.");

  const items = await db
    .select({
      id: orderItems.id,
      name: orderItems.itemNameSnapshot,
      variantName: orderItems.variantNameSnapshot,
      unitCents: orderItems.unitPriceCentsSnapshot,
      quantity: orderItems.quantity,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id))
    .orderBy(asc(orderItems.createdAt));
  const itemIds = items.map((item) => item.id);
  const modifierRows = itemIds.length
    ? await db
        .select({
          orderItemId: orderItemModifiers.orderItemId,
          name: orderItemModifiers.nameSnapshot,
        })
        .from(orderItemModifiers)
        .where(inArray(orderItemModifiers.orderItemId, itemIds))
    : [];
  const modifiersByItem = new Map<string, string[]>();
  for (const modifier of modifierRows) {
    const list = modifiersByItem.get(modifier.orderItemId) ?? [];
    list.push(modifier.name);
    modifiersByItem.set(modifier.orderItemId, list);
  }

  const reference = orderReference(order.publicToken);
  const isDineIn = order.orderType === "dine_in";
  const ticketName = (
    isDineIn && order.tableLabel ? `Table ${order.tableLabel}` : reference
  ).slice(0, 30);
  const fulfillmentNote = [
    isDineIn ? `DINE-IN · Table ${order.tableLabel ?? "?"}` : null,
    reference,
    order.notes,
  ]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 500);

  const created = await squareFetch<CreateOrderResponse>("/v2/orders", {
    method: "POST",
    accessToken,
    body: {
      idempotency_key: job.id,
      order: {
        location_id: integration.providerLocationId,
        reference_id: order.id,
        ticket_name: ticketName,
        source: { name: "prompt2eat" },
        line_items: items.map((item) => ({
          name: `${item.name}${item.variantName ? ` (${item.variantName})` : ""}`.slice(0, 512),
          quantity: String(item.quantity),
          base_price_money: aud(item.unitCents),
          note:
            (modifiersByItem.get(item.id) ?? []).join(", ").slice(0, 2000) ||
            undefined,
        })),
        fulfillments: [
          {
            type: "PICKUP",
            state: "PROPOSED",
            pickup_details: {
              recipient: { display_name: order.customerName.slice(0, 255) },
              ...(order.scheduledFor && !isDineIn
                ? {
                    schedule_type: "SCHEDULED",
                    pickup_at: order.scheduledFor.toISOString(),
                  }
                : { schedule_type: "ASAP" }),
              note: fulfillmentNote || undefined,
            },
          },
        ],
      },
    },
  });

  // Square computes total_money server-side (read-only). With plain ad-hoc
  // lines it MUST equal our snapshot total; a mismatch is a mapping bug and
  // must never be mirrored as money truth.
  const squareTotal = created.order.total_money?.amount;
  if (squareTotal !== order.totalCents) {
    throw new Error(
      `Square total ${squareTotal ?? "?"}c does not match the order total ${order.totalCents}c.`,
    );
  }

  await squareFetch("/v2/payments", {
    method: "POST",
    accessToken,
    body: {
      idempotency_key: `${job.id}-pay`,
      source_id: "EXTERNAL",
      external_details: { type: "EXTERNAL", source: "prompt2eat" },
      amount_money: aud(order.totalCents),
      order_id: created.order.id,
      location_id: integration.providerLocationId,
    },
  });

  return { providerRef: created.order.id };
};

/**
 * Cron-driven maintenance (registered as dispatch's square maintainer): keep
 * every ACTIVE Square connection on the ≤7-day refresh cadence even when no
 * orders are flowing, per Square's best practice. Best-effort per row —
 * a revoked grant flips the row to `revoked` inside ensureFreshAccessToken.
 */
export async function maintainSquareTokens(): Promise<void> {
  const cutoff = new Date(Date.now() - REFRESH_CADENCE_MS);
  const stale = await db
    .select()
    .from(venueIntegrations)
    .where(
      and(
        eq(venueIntegrations.provider, "square"),
        eq(venueIntegrations.status, "active"),
        lt(venueIntegrations.tokenRefreshedAt, cutoff),
      ),
    )
    .limit(20);
  for (const integration of stale) {
    try {
      await ensureFreshAccessToken(integration);
    } catch {
      // Recorded on the row by ensureFreshAccessToken where meaningful;
      // maintenance never throws out to the cron route.
    }
  }
}
