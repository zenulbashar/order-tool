import { createHmac } from "node:crypto";

import { expect, test } from "@playwright/test";
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";

/**
 * Full-path checkout safety net (M3 / audit F8): cart → checkout → order
 * persisted with a real PaymentIntent → signature-verified webhook →
 * confirmed order, then a REPLAY of the same webhook asserting nothing moves
 * twice.
 *
 * ── This suite does NOT run in CI, by design ──────────────────────────────
 * It needs a seeded database, a Stripe test key, and a Connect account with
 * charges enabled. CI's E2E job has none of those (it runs the anonymous
 * marketing surface only), so the whole file skips unless the four variables
 * below are present. The fast, always-on coverage of these same rules lives
 * in lib/payments/line-plan.test.ts (pricing + hostile input) and
 * test/stripe-webhook-idempotency.test.ts (the replay contract) — this spec
 * is what proves they hold end to end against a real browser and database.
 *
 * To run it against a staging deployment (see docs/ops/Testing.md):
 *   E2E_CHECKOUT_SLUG=<venue-slug> \
 *   E2E_CHECKOUT_ITEM="<exact menu item name>" \
 *   DATABASE_URL=<staging pooled url> \
 *   STRIPE_WEBHOOK_SECRET=<the endpoint's signing secret> \
 *   PLAYWRIGHT_BASE_URL=https://<staging-host> \
 *     npx playwright test e2e/checkout.spec.ts
 *
 * The webhook is signed here rather than driving Stripe's card iframe: the
 * iframe is third-party and flaky, while the signature path is the actual
 * security boundary we want exercised. Confirmation is the webhook's job in
 * production too — there is no second confirmation path.
 */

const SLUG = process.env.E2E_CHECKOUT_SLUG;
const ITEM = process.env.E2E_CHECKOUT_ITEM;
const DATABASE_URL = process.env.DATABASE_URL;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

const CONFIGURED = Boolean(SLUG && ITEM && DATABASE_URL && WEBHOOK_SECRET);

test.describe("checkout → webhook → confirmed (seeded env only)", () => {
  test.skip(
    !CONFIGURED,
    "Set E2E_CHECKOUT_SLUG, E2E_CHECKOUT_ITEM, DATABASE_URL and STRIPE_WEBHOOK_SECRET to run the full-path checkout spec.",
  );

  neonConfig.webSocketConstructor = ws;

  /** One-shot query helper; a fresh pool per call keeps the spec stateless. */
  async function query<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const pool = new Pool({ connectionString: DATABASE_URL });
    try {
      const result = await pool.query(sql, params);
      return result.rows as T[];
    } finally {
      await pool.end();
    }
  }

  /** Stripe's scheme: v1 = HMAC-SHA256 over `<timestamp>.<raw body>`. */
  function signedHeaders(payload: string): Record<string, string> {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", WEBHOOK_SECRET!)
      .update(`${timestamp}.${payload}`)
      .digest("hex");
    return {
      "content-type": "application/json",
      "stripe-signature": `t=${timestamp},v1=${signature}`,
    };
  }

  function succeededEvent(paymentIntentId: string): string {
    return JSON.stringify({
      id: `evt_e2e_${paymentIntentId}`,
      object: "event",
      type: "payment_intent.succeeded",
      data: { object: { id: paymentIntentId, object: "payment_intent" } },
    });
  }

  test("confirms once, and a replayed webhook moves nothing twice", async ({
    page,
    request,
  }) => {
    const [venue] = await query<{ id: string }>(
      "select id from venues where slug = $1",
      [SLUG],
    );
    expect(venue, `No venue with slug "${SLUG}"`).toBeTruthy();

    // ── cart ────────────────────────────────────────────────────────────
    await page.goto(`/${SLUG}`);
    // Quick-add items expose "Add <name> to cart"; items with modifiers
    // expose "Choose <name>" and open a sheet first.
    const quickAdd = page.getByLabel(`Add ${ITEM} to cart`).first();
    const choose = page.getByLabel(`Choose ${ITEM}`).first();
    if (await quickAdd.count()) {
      await quickAdd.click();
    } else {
      await choose.click();
      await page.getByRole("button", { name: /add to cart/i }).click();
    }
    await expect(page.getByRole("button", { name: /view cart/i })).toBeVisible();

    // ── checkout ────────────────────────────────────────────────────────
    await page.goto(`/${SLUG}/checkout`);
    await page.getByLabel("Name", { exact: true }).fill("E2E Diner");
    await page.getByLabel("Email", { exact: true }).fill("e2e@example.test");
    await page.getByRole("button", { name: /continue to payment/i }).click();

    // placeOrder has now persisted the order and created the PaymentIntent on
    // the venue's connected account. The DB is the oracle for both ids.
    const [order] = await query<{
      id: string;
      public_token: string;
      stripe_payment_intent_id: string | null;
      status: string;
    }>(
      `select id, public_token, stripe_payment_intent_id, status
         from orders
        where venue_id = $1
        order by created_at desc
        limit 1`,
      [venue.id],
    );
    expect(order, "placeOrder did not persist an order").toBeTruthy();
    expect(order.status).toBe("pending_payment");
    expect(
      order.stripe_payment_intent_id,
      "No PaymentIntent — check the Stripe test key and the venue's charges_enabled",
    ).toBeTruthy();

    const paymentIntentId = order.stripe_payment_intent_id!;
    const payload = succeededEvent(paymentIntentId);

    // ── webhook → confirmed ─────────────────────────────────────────────
    const first = await request.post("/api/stripe/webhook", {
      headers: signedHeaders(payload),
      data: payload,
    });
    expect(first.status()).toBe(200);

    const [confirmedRow] = await query<{ status: string }>(
      "select status from orders where id = $1",
      [order.id],
    );
    expect(confirmedRow.status).toBe("confirmed");

    await page.goto(`/${SLUG}/order/${order.public_token}`);
    await expect(page.getByText(/your order is confirmed/i)).toBeVisible();

    // Ledger state after exactly one confirmation, for the replay comparison.
    const ledgerCounts = async () => {
      const [row] = await query<{
        points: string;
        gift: string;
        movements: string;
      }>(
        `select
           (select count(*) from points_ledger      where order_id = $1) as points,
           (select count(*) from gift_card_ledger   where order_id = $1) as gift,
           (select count(*) from stock_movements    where order_id = $1) as movements`,
        [order.id],
      );
      return row;
    };
    const afterFirst = await ledgerCounts();

    // ── REPLAY: the idempotency contract ────────────────────────────────
    // Stripe retries routinely. A second delivery must confirm nothing again
    // and must not write a single extra ledger row.
    const replay = await request.post("/api/stripe/webhook", {
      headers: signedHeaders(payload),
      data: payload,
    });
    expect(replay.status()).toBe(200);

    const afterReplay = await ledgerCounts();
    expect(
      afterReplay,
      "A replayed webhook wrote extra ledger rows — idempotency is broken",
    ).toEqual(afterFirst);

    const [stillConfirmed] = await query<{ status: string }>(
      "select status from orders where id = $1",
      [order.id],
    );
    expect(stillConfirmed.status).toBe("confirmed");
  });

  test("an unsigned webhook cannot confirm an order", async ({ request }) => {
    const payload = succeededEvent("pi_forged_e2e");
    const response = await request.post("/api/stripe/webhook", {
      headers: { "content-type": "application/json" },
      data: payload,
    });
    // No signature header at all → rejected before anything is parsed.
    expect(response.status()).toBe(400);
  });
});
