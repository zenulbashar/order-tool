import { formatCents } from "@/lib/validation";

import type { OrderEvent } from "./notify";

/**
 * Branded order-notification email (confirmed / ready), rendered as a
 * self-contained HTML document with INLINE styles + table layout (the only
 * reliable cross-client approach — no external CSS, no web fonts). Colours are
 * the Prompt2Eat design tokens: forest ink `#16241C`, cream `#F7F3EA` /
 * `#FFFDF8`, sand border `#EFE7D6`, amber `#F4B43C`. A plain-text alternative is
 * returned alongside for non-HTML clients. Content is escaped — venue/item names
 * are user data.
 */
export type OrderEmailItem = {
  name: string;
  variantName: string | null;
  quantity: number;
  lineTotalCents: number;
};

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderOrderEmail(opts: {
  event: OrderEvent;
  venueName: string;
  firstName: string;
  reference: string;
  orderType: "dine_in" | "pickup";
  items: OrderEmailItem[];
  totalCents: number;
  url: string;
}): { subject: string; html: string; text: string } {
  const { event, venueName, firstName, reference, orderType, items, totalCents, url } =
    opts;
  const collect = orderType === "dine_in" ? "" : " to collect";
  const eyebrow = event === "confirmed" ? "Order confirmed" : "Order ready";
  const subject =
    event === "confirmed"
      ? `Order confirmed — ${venueName}`
      : `Your order is ready${collect} — ${venueName}`;
  const headline =
    event === "confirmed"
      ? `Thanks ${firstName}, your order is confirmed`
      : `${firstName}, your order is ready${collect}`;
  const sub =
    event === "confirmed"
      ? `${venueName} has your order. We'll let you know when it's ready.`
      : `Head to ${venueName} — order ${reference} is ready${collect}.`;
  const cta = event === "confirmed" ? "Track your order" : "View your order";

  const itemRows = items
    .map(
      (item) => `
        <tr>
          <td style="padding:6px 0;color:#16241C;font-size:14px;">
            ${item.quantity}× ${esc(item.name)}${
              item.variantName ? ` <span style="color:#6E756B;">(${esc(item.variantName)})</span>` : ""
            }
          </td>
          <td style="padding:6px 0;color:#16241C;font-size:14px;text-align:right;white-space:nowrap;">
            $${formatCents(item.lineTotalCents)}
          </td>
        </tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#F7F3EA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F3EA;padding:24px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#FFFDF8;border:1px solid #EFE7D6;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="background:#16241C;padding:20px 24px;">
              <div style="color:#F4B43C;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">${eyebrow}</div>
              <div style="color:#F7F3EA;font-size:20px;font-weight:800;margin-top:4px;">${esc(venueName)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <div style="color:#16241C;font-size:20px;font-weight:800;">${esc(headline)}</div>
              <div style="color:#6E756B;font-size:14px;margin-top:6px;line-height:1.5;">${esc(sub)}</div>
              <div style="color:#a0987f;font-size:12px;margin-top:10px;">Order ${esc(reference)}</div>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;border-top:1px solid #EFE7D6;">
                ${itemRows}
                <tr>
                  <td style="padding:10px 0 0;border-top:1px solid #EFE7D6;color:#16241C;font-size:15px;font-weight:800;">Total</td>
                  <td style="padding:10px 0 0;border-top:1px solid #EFE7D6;color:#16241C;font-size:15px;font-weight:800;text-align:right;">$${formatCents(totalCents)}</td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:22px;">
                <tr><td style="border-radius:12px;background:#16241C;">
                  <a href="${esc(url)}" style="display:inline-block;padding:13px 22px;color:#F7F3EA;font-size:14px;font-weight:700;text-decoration:none;border-radius:12px;">${cta}</a>
                </td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;border-top:1px solid #EFE7D6;color:#b6ab92;font-size:11px;line-height:1.5;">
              You're receiving this because you placed an order with ${esc(venueName)}. This is a one-off order update, not marketing.
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = [
    headline,
    sub,
    `Order ${reference}`,
    "",
    ...items.map(
      (item) =>
        `${item.quantity}× ${item.name}${item.variantName ? ` (${item.variantName})` : ""} — $${formatCents(item.lineTotalCents)}`,
    ),
    `Total: $${formatCents(totalCents)}`,
    "",
    `${cta}: ${url}`,
  ].join("\n");

  return { subject, html, text };
}
