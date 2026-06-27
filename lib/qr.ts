import QRCode from "qrcode";

/**
 * Build the absolute storefront deep-link for a dine-in table. The storefront
 * (app/[slug]/page.tsx) reads the `?table=` param and seeds dine-in with this
 * label pre-filled, so the link needs ONLY the table param — no order-type
 * param. The label is URL-encoded exactly as the cart/checkout already encode
 * it (encodeURIComponent), so "Patio 3" -> "Patio%203" round-trips cleanly.
 *
 * `baseUrl` comes from getBaseUrl() (no trailing slash); pass venue.slug.
 */
export function tableDeepLink(
  baseUrl: string,
  slug: string,
  label: string,
): string {
  return `${baseUrl}/${slug}?table=${encodeURIComponent(label)}`;
}

/**
 * Render a QR code for `url` as an inline SVG string. SVG (vector) so it stays
 * crisp at any printer DPI, unlike a rasterised PNG. Uses only qrcode's pure-JS
 * `toString` path (no canvas, no fs), so it runs in the Node server runtime and
 * never ships to the client. Error-correction "M" balances code density against
 * scan resilience on a printed sheet.
 */
export async function tableQrSvg(url: string): Promise<string> {
  return QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    width: 256,
  });
}
