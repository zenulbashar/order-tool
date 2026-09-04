import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import { and, eq, gt, inArray, sql } from "drizzle-orm";

import { getAnthropic, MENU_COPY_MODEL } from "@/lib/anthropic";
import { db } from "@/lib/db";
import { PAID_ORDER_STATUSES } from "@/lib/db/order-status";
import { orderItems, orders, refunds } from "@/lib/db/schema";
import {
  buildInsightsFacts,
  formatFactsForModel,
  INSIGHTS_JSON_SCHEMA,
  INSIGHTS_SYSTEM,
  INSIGHTS_WINDOW_DAYS,
  type InsightsAnswer,
  type InsightsFacts,
  parseInsightsAnswer,
} from "@/lib/insights-core";
import { scopedToVenue } from "@/lib/tenant";

export const INSIGHTS_MODEL = MENU_COPY_MODEL;
const INSIGHTS_MAX_TOKENS = 700;

export function isInsightsConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * The venue's fact sheet: the SAME three venue-scoped reads Reports makes
 * (paid orders in the window, their lines, succeeded refunds keyed by order),
 * folded by the pure builder. The model never sees a row — only this.
 */
export async function loadInsightsFacts(
  venue: { id: string; timezone: string },
  now: Date = new Date(),
): Promise<InsightsFacts> {
  const since = new Date(now.getTime() - INSIGHTS_WINDOW_DAYS * 86_400_000);
  const [orderRows, itemRows, refundRows] = await Promise.all([
    db
      .select({
        id: orders.id,
        totalCents: orders.totalCents,
        taxCents: orders.taxCents,
        orderType: orders.orderType,
        createdAt: orders.createdAt,
        scheduledFor: orders.scheduledFor,
        discountCents: orders.discountCents,
        promoDiscountCents: orders.promoDiscountCents,
        pointsDiscountCents: orders.pointsDiscountCents,
        giftCardRedeemedCents: orders.giftCardRedeemedCents,
        customerId: orders.customerId,
      })
      .from(orders)
      .where(
        and(
          scopedToVenue(orders.venueId, venue.id),
          inArray(orders.status, PAID_ORDER_STATUSES),
          gt(orders.createdAt, since),
        ),
      ),
    db
      .select({
        name: orderItems.itemNameSnapshot,
        quantity: orderItems.quantity,
        lineTotalCents: orderItems.lineTotalCents,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(
        and(
          scopedToVenue(orders.venueId, venue.id),
          inArray(orders.status, PAID_ORDER_STATUSES),
          gt(orders.createdAt, since),
        ),
      ),
    db
      .select({
        orderId: refunds.orderId,
        total: sql<number>`coalesce(sum(${refunds.amountCents}), 0)`,
      })
      .from(refunds)
      .innerJoin(orders, eq(orders.id, refunds.orderId))
      .where(
        and(
          scopedToVenue(orders.venueId, venue.id),
          eq(refunds.status, "succeeded"),
          gt(orders.createdAt, since),
        ),
      )
      .groupBy(refunds.orderId),
  ]);
  return buildInsightsFacts({
    orders: orderRows,
    items: itemRows,
    refundedByOrder: new Map(refundRows.map((row) => [row.orderId, Number(row.total)])),
    timeZone: venue.timezone,
    now,
  });
}

export type AskInsightsResult =
  | { ok: true; answer: InsightsAnswer }
  | { ok: false; error: string };

/**
 * One question → one bounded answer. The fact sheet rides as a prompt-cached
 * system block (byte-identical for a service day, so follow-up questions are
 * cheap); the reply is forced to the JSON schema and re-validated. Any failure
 * is a plain error for the panel, never a thrown exception.
 */
export async function askInsights(
  facts: InsightsFacts,
  question: string,
): Promise<AskInsightsResult> {
  if (!isInsightsConfigured()) {
    return { ok: false, error: "AI insights aren't switched on for this deployment yet." };
  }
  let message: Anthropic.Message;
  try {
    message = await getAnthropic().messages.create({
      model: INSIGHTS_MODEL,
      max_tokens: INSIGHTS_MAX_TOKENS,
      system: [
        { type: "text", text: INSIGHTS_SYSTEM },
        {
          type: "text",
          text: `Fact sheet:\n${formatFactsForModel(facts)}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      output_config: { format: { type: "json_schema", schema: INSIGHTS_JSON_SCHEMA } },
      messages: [{ role: "user", content: question }],
    });
  } catch {
    return { ok: false, error: "Couldn't reach the assistant. Try again in a moment." };
  }
  if (message.stop_reason === "refusal" || message.stop_reason === "max_tokens") {
    return { ok: false, error: "The assistant couldn't answer that one. Try rephrasing." };
  }
  const textBlock = message.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text",
  );
  let json: unknown = null;
  try {
    json = textBlock ? JSON.parse(textBlock.text) : null;
  } catch {
    json = null;
  }
  const answer = parseInsightsAnswer(json);
  if (!answer) {
    return { ok: false, error: "The assistant gave an unusable reply. Try again." };
  }
  return { ok: true, answer };
}
