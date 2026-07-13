"use server";

import { eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";

import { z } from "zod";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  marketplaceOrderItems,
  marketplaceOrders,
  marketplaceProducts,
  venues,
} from "@/lib/db/schema";
import { getStripe } from "@/lib/stripe";
import { requireVenue } from "@/lib/tenant";
import { getBaseUrl } from "@/lib/url";

const MARKETPLACE_PATH = "/dashboard/marketplace";

const orderSchema = z.object({
  note: z.string().trim().max(500).optional().default(""),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().min(1).max(999),
      }),
    )
    .min(1)
    .max(50),
});

export type PlaceOrderInput = z.infer<typeof orderSchema>;

/**
 * Check out a hardware order for the current venue (Track F, F2). Server-
 * authoritative pricing exactly as before — prices come from the LIVE active
 * catalog (the client never sends amounts), line totals + the order total are
 * recomputed and snapshotted — then the venue PAYS via Stripe-hosted Checkout on
 * the PLATFORM account (the same billing relationship as subscriptions, NOT the
 * venue's Connect account). The order is created `pending_payment` and only
 * becomes a real `requested` order once the billing webhook confirms payment, so
 * an abandoned checkout never enters fulfilment. This charge is on the platform
 * account and shares nothing with the diner money path (placeOrder / the order
 * webhook are untouched).
 *
 * Always redirects: to Stripe Checkout on success, or back with ?error=checkout.
 * The redirect stays OUTSIDE the try/catch (it throws NEXT_REDIRECT, which a
 * catch would swallow).
 */
export async function checkoutMarketplaceOrder(
  input: PlaceOrderInput,
): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const venue = await requireVenue();

  let destination: string;
  try {
    const parsed = orderSchema.safeParse(input);
    if (!parsed.success) throw new Error("Invalid order.");

    // Collapse duplicate lines, then resolve against the live, active catalog.
    const qtyByProduct = new Map<string, number>();
    for (const line of parsed.data.items) {
      qtyByProduct.set(
        line.productId,
        (qtyByProduct.get(line.productId) ?? 0) + line.quantity,
      );
    }

    const products = await db
      .select({
        id: marketplaceProducts.id,
        name: marketplaceProducts.name,
        priceCents: marketplaceProducts.priceCents,
        isActive: marketplaceProducts.isActive,
      })
      .from(marketplaceProducts)
      .where(inArray(marketplaceProducts.id, [...qtyByProduct.keys()]));
    const active = products.filter((p) => p.isActive);
    if (active.length === 0) throw new Error("Items unavailable.");

    const rows = active.map((product) => {
      const quantity = qtyByProduct.get(product.id) ?? 0;
      return {
        productId: product.id,
        nameSnapshot: product.name,
        unitPriceCentsSnapshot: product.priceCents,
        quantity,
        lineTotalCents: product.priceCents * quantity,
      };
    });
    const totalCents = rows.reduce((sum, r) => sum + r.lineTotalCents, 0);

    // Create the order in the pre-payment state, with its line snapshots.
    const orderId = await db.transaction(async (tx) => {
      const [order] = await tx
        .insert(marketplaceOrders)
        .values({
          venueId: venue.id,
          status: "pending_payment",
          totalCents,
          note: parsed.data.note.trim() || null,
        })
        .returning({ id: marketplaceOrders.id });
      await tx
        .insert(marketplaceOrderItems)
        .values(rows.map((row) => ({ orderId: order.id, ...row })));
      return order.id;
    });

    const stripe = getStripe();

    // Reuse (or create + persist) the venue's PLATFORM Stripe customer — the same
    // one billing uses — so a venue has a single platform customer across both.
    let customerId = venue.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: session.user.email ?? undefined,
        name: venue.name,
        metadata: { venueId: venue.id },
      });
      customerId = customer.id;
      await db
        .update(venues)
        .set({ stripeCustomerId: customerId })
        .where(eq(venues.id, venue.id));
    }

    const baseUrl = await getBaseUrl();
    const checkout = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      line_items: rows.map((row) => ({
        quantity: row.quantity,
        price_data: {
          currency: "aud",
          unit_amount: row.unitPriceCentsSnapshot,
          product_data: { name: row.nameSnapshot },
        },
      })),
      // The webhook resolves the order by marketplaceOrderId; venueId is carried
      // too for parity with billing's metadata.
      metadata: { venueId: venue.id, marketplaceOrderId: orderId },
      payment_intent_data: {
        metadata: { venueId: venue.id, marketplaceOrderId: orderId },
      },
      success_url: `${baseUrl}${MARKETPLACE_PATH}?checkout=success`,
      cancel_url: `${baseUrl}${MARKETPLACE_PATH}?checkout=cancel`,
    });

    if (!checkout.url) throw new Error("Stripe did not return a Checkout URL.");

    await db
      .update(marketplaceOrders)
      .set({ stripeCheckoutSessionId: checkout.id })
      .where(eq(marketplaceOrders.id, orderId));

    destination = checkout.url;
  } catch {
    destination = `${MARKETPLACE_PATH}?error=checkout`;
  }

  redirect(destination);
}
