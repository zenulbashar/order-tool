"use server";

import { inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { z } from "zod";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  marketplaceOrderItems,
  marketplaceOrders,
  marketplaceProducts,
} from "@/lib/db/schema";
import { requireVenue, type Venue } from "@/lib/tenant";

const MARKETPLACE_PATH = "/dashboard/marketplace";

async function requireVenueForAction(): Promise<Venue> {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  return requireVenue();
}

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

export type PlaceOrderResult = { ok: true } | { ok: false; error: string };

/**
 * Place a hardware order for the current venue (Track F). Server-authoritative:
 * prices come from the LIVE active catalog (the client never sends amounts);
 * line totals + the order total are recomputed and snapshotted here, so a later
 * catalog price change never rewrites a placed order. v1 is request-to-order
 * (status 'requested', invoiced later) — no charge, so nothing here touches the
 * diner money path.
 */
export async function placeMarketplaceOrder(
  input: PlaceOrderInput,
): Promise<PlaceOrderResult> {
  const venue = await requireVenueForAction();
  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check your order and try again." };

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
  if (active.length === 0) return { ok: false, error: "These items are no longer available." };

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

  await db.transaction(async (tx) => {
    const [order] = await tx
      .insert(marketplaceOrders)
      .values({
        venueId: venue.id,
        totalCents,
        note: parsed.data.note.trim() || null,
      })
      .returning({ id: marketplaceOrders.id });
    await tx
      .insert(marketplaceOrderItems)
      .values(rows.map((row) => ({ orderId: order.id, ...row })));
  });

  revalidatePath(MARKETPLACE_PATH);
  return { ok: true };
}
