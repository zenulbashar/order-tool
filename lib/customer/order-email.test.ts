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

  it("shows the subtotal + discount breakdown when discounted", () => {
    const html = renderOrderEmail({
      ...base,
      subtotalCents: 4000,
      discountCents: 800,
      totalCents: 3200,
    }).html;
    expect(html).toContain("Subtotal");
    expect(html).toContain("$40.00");
    expect(html).toContain("Discount");
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
