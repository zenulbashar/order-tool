/**
 * Branded customer (diner) sign-in email. VENUE-first, per the owner↔diner
 * firewall: it carries the venue's own name + brand accent, never Prompt2Eat's
 * forest/amber identity. Self-contained HTML (inline styles + table layout, no
 * web fonts) on the neutral cream/ink design-system shell — the brand colour is
 * an ACCENT (a top rule, the logo/initial tile, and the button), never the
 * canvas, matching the "brand colour is an accent, never a canvas" rule.
 *
 * The button label colour is the WCAG-readable of cream/ink on the venue brand
 * — computed HERE as a literal hex, because email clients can't read the CSS
 * vars that readableOn() returns. Pure: no I/O, no env.
 */

const PLATFORM = "Prompt2Eat";

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseHex(input: string): [number, number, number] | null {
  let h = input.trim().replace(/^#/, "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function luminance([r, g, b]: [number, number, number]): number {
  const [rl, gl, bl] = [r, g, b].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

const CREAM = "#FFFDF8";
const INK = "#16241C";

/** Readable cream/ink hex to pair with a venue brand fill (readableOn as hex). */
function readableHexOn(brandHex: string): string {
  const rgb = parseHex(brandHex);
  if (!rgb) return CREAM;
  const b = luminance(rgb);
  const contrast = (a: number, x: number) =>
    (Math.max(a, x) + 0.05) / (Math.min(a, x) + 0.05);
  // Fixed luminances of cream (#fffdf8) and ink (#0e1f18).
  return contrast(0.983, b) >= contrast(0.015, b) ? CREAM : INK;
}

export function renderCustomerSignInEmail(opts: {
  venueName: string;
  brandColor: string;
  logoUrl: string | null;
  url: string;
}): { subject: string; html: string; text: string } {
  const { venueName, url } = opts;
  const safeUrl = esc(url);
  const name = esc(venueName);
  // Fall back to ink if the stored brand colour is unparseable, so the accent is
  // never a broken/empty value.
  const brand = parseHex(opts.brandColor) ? opts.brandColor.trim() : INK;
  const onBrand = readableHexOn(brand);
  const initial = venueName.trim().charAt(0).toUpperCase() || "•";

  const logoTile = opts.logoUrl
    ? `<img src="${esc(opts.logoUrl)}" alt="${name}" width="48" height="48" style="width:48px;height:48px;border-radius:12px;background:#FFFFFF;object-fit:contain;border:1px solid #EFE7D6;" />`
    : `<span style="display:inline-block;width:48px;height:48px;border-radius:12px;background:${brand};color:${onBrand};font-size:22px;font-weight:800;line-height:48px;text-align:center;">${esc(initial)}</span>`;

  const subject = `Sign in to ${venueName}`;

  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#F7F3EA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F3EA;padding:24px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#FFFDF8;border:1px solid #EFE7D6;border-radius:16px;overflow:hidden;">
          <tr><td style="height:4px;background:${brand};font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr>
            <td style="padding:24px 24px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                <td style="vertical-align:middle;">${logoTile}</td>
                <td style="vertical-align:middle;padding-left:12px;color:#16241C;font-size:18px;font-weight:800;">${name}</td>
              </tr></table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 24px 26px;">
              <div style="color:#16241C;font-size:20px;font-weight:800;">View your orders at ${name}</div>
              <div style="color:#6E756B;font-size:14px;margin-top:8px;line-height:1.5;">
                Tap the button below to see your order history and points at ${name}. This link expires in 15 minutes and can be used once.
              </div>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:22px;">
                <tr><td style="border-radius:12px;background:${brand};border:1px solid rgba(20,30,25,0.10);">
                  <a href="${safeUrl}" style="display:inline-block;padding:13px 26px;color:${onBrand};font-size:15px;font-weight:700;text-decoration:none;border-radius:12px;">View my orders</a>
                </td></tr>
              </table>
              <div style="color:#86907f;font-size:12px;margin-top:22px;line-height:1.5;">
                Or paste this link into your browser:<br />
                <a href="${safeUrl}" style="color:#6E756B;word-break:break-all;">${safeUrl}</a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;border-top:1px solid #EFE7D6;color:#b6ab92;font-size:11px;line-height:1.5;">
              If you didn't request this email you can safely ignore it — no one can sign in without this link.
              <div style="margin-top:8px;color:#a0987f;">${name} · ordering powered by ${PLATFORM}</div>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = [
    `Sign in to ${venueName}`,
    "",
    `Use the link below to view your orders and points at ${venueName}. It expires in 15 minutes and can be used once.`,
    "",
    url,
    "",
    "If you didn't request this email you can safely ignore it.",
    `${venueName} · ordering powered by ${PLATFORM}`,
  ].join("\n");

  return { subject, html, text };
}
