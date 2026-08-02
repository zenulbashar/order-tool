import { describe, expect, it } from "vitest";

import { renderOrderEmail } from "./order-email";

const base = {
  event: "confirmed" as const,
  venueName: "Corner Café",
  firstName: "Sam",
  reference: "ABCD1234",
  orderType: "pickup" as const,
  items: [
    { name: "Margherita", variantName: "Large", quantity: 2, lineTotalCents: 3200 },
  ],
  brandColor: "#7A5AF8",
  logoUrl: null,
  totalCents: 3200,
  url: "https://prompt2eat.com/corner-cafe/order/tok123?a=1&b=2",
};

describe("renderOrderEmail", () => {
  it("is venue-branded with a readable button label, plus platform attribution", () => {
    const { subject, html } = renderOrderEmail(base);
    expect(subject).toBe("Order confirmed — Corner Café");
    expect(html).toContain("Corner Café");
    expect(html).toContain("#7A5AF8"); // brand accent (stripe + button)
    expect(html).toContain("color:#FFFDF8"); // readable cream label on the dark brand
    expect(html).toContain("ordering powered by Prompt2Eat");
    // Item + total still render.
    expect(html).toContain("2× Margherita");
    expect(html).toContain("$32.00");
  });

  it("uses an ink label on a light brand", () => {
    expect(renderOrderEmail({ ...base, brandColor: "#f4d03f" }).html).toContain(
      "color:#16241C",
    );
  });

  /**
   * Audit C5: the itemised rows carry FULL prices, so a discounted order used to
   * show lines that visibly summed to more than the stated Total. The breakdown
   * is what makes them reconcile — so the tests assert the arithmetic, not just
   * that the words "Subtotal" and "Discount" appear.
   */
  it("shows a subtotal + discount breakdown that reconciles to the total", () => {
    const { html } = renderOrderEmail({
      ...base,
      subtotalCents: 4000,
      discountCents: 800,
      totalCents: 3200,
    });

    // The three figures must actually add up: 40.00 − 8.00 = 32.00.
    expect(html).toContain("$40.00");
    expect(html).toContain("$8.00");
    expect(html).toContain("$32.00");
    // And the line items must reconcile to the subtotal, not to the total.
    const itemSum = base.items.reduce((n, i) => n + i.lineTotalCents, 0);
    expect(itemSum + 800).toBe(4000);
  });

  it("carries the same breakdown in the plain-text part", () => {
    // Plain text is what a screen reader or a text-only client renders; a
    // breakdown present in one part and missing from the other still leaves a
    // receipt whose rows do not add up.
    const { text } = renderOrderEmail({
      ...base,
      subtotalCents: 4000,
      discountCents: 800,
      totalCents: 3200,
    });
    expect(text).toContain("Subtotal: $40.00");
    expect(text).toContain("Discount: -$8.00");
    expect(text).toContain("Total: $32.00");
  });

  it("derives the subtotal when a caller passes a discount without one", () => {
    // Defaulting the subtotal to the total would print Subtotal $32.00,
    // Discount −$8.00, Total $32.00 — a breakdown that contradicts itself.
    const { html, text } = renderOrderEmail({
      ...base,
      discountCents: 800,
      totalCents: 3200,
    });
    expect(text).toContain("Subtotal: $40.00");
    expect(text).toContain("Total: $32.00");
    expect(html).toContain("$40.00");
  });

  it("shows no breakdown at all when nothing was discounted", () => {
    // An undiscounted receipt should stay a plain item list + Total.
    const { html, text } = renderOrderEmail(base);
    expect(html).not.toContain("Subtotal");
    expect(html).not.toContain("Discount");
    expect(text).not.toContain("Subtotal:");
  });

  it("HTML-escapes the venue name and URL", () => {
    const html = renderOrderEmail({
      ...base,
      venueName: "Bar & <Grill>",
      url: "https://x.test/o?t=1&u=2",
    }).html;
    expect(html).toContain("Bar &amp; &lt;Grill&gt;");
    expect(html).toContain("t=1&amp;u=2");
  });
});
