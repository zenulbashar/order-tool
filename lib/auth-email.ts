/**
 * Branded owner sign-in (magic-link) email — the Prompt2Eat identity applied to
 * the Auth.js Resend flow, replacing the provider's plain default ("Sign in to
 * <host>" + a generic blue button). Self-contained HTML (inline styles + table
 * layout, no web fonts, no external/SVG images — the safest cross-client
 * approach), with a plain-text alternative.
 *
 * Colours are the design tokens: forest ink #16241C, cream #F7F3EA / #FFFDF8,
 * sand border #EFE7D6, amber #F4B43C, muted #6E756B. The wordmark's amber "2" is
 * the sanctioned brand touchpoint (identity, not an AI accent). Owner-facing, so
 * it carries the Prompt2Eat identity — the diner magic link is venue-branded and
 * firewalled separately.
 *
 * Pure: no I/O, no env. lib/auth.ts sends the result via the Resend REST API.
 */

const BRAND = "Prompt2Eat";
const SITE = "prompt2eat.com";

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The wordmark as inline HTML: "Prompt" + amber "2" + "Eat". */
function wordmark(sizePx: number): string {
  return `<span style="font-weight:800;font-size:${sizePx}px;letter-spacing:-0.02em;color:#F7F3EA;">Prompt<span style="color:#F4B43C;">2</span>Eat</span>`;
}

export function renderSignInEmail(url: string): {
  subject: string;
  html: string;
  text: string;
} {
  const safeUrl = esc(url);
  const subject = `Sign in to ${BRAND}`;

  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#F7F3EA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F3EA;padding:24px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#FFFDF8;border:1px solid #EFE7D6;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="background:#16241C;padding:22px 24px;">
              <div style="color:#F4B43C;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">Sign in</div>
              <div style="margin-top:6px;">${wordmark(22)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 24px;">
              <div style="color:#16241C;font-size:20px;font-weight:800;">Sign in to ${BRAND}</div>
              <div style="color:#6E756B;font-size:14px;margin-top:8px;line-height:1.5;">
                Tap the button below to sign in to your ${BRAND} dashboard. This link expires in 24 hours and can be used once.
              </div>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:22px;">
                <tr><td style="border-radius:12px;background:#16241C;">
                  <a href="${safeUrl}" style="display:inline-block;padding:13px 26px;color:#F7F3EA;font-size:15px;font-weight:700;text-decoration:none;border-radius:12px;">Sign in</a>
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
              <div style="margin-top:8px;color:#a0987f;">${BRAND} · ${SITE}</div>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = [
    `Sign in to ${BRAND}`,
    "",
    "Use the link below to sign in to your dashboard. It expires in 24 hours and can be used once.",
    "",
    url,
    "",
    "If you didn't request this email you can safely ignore it.",
    `${BRAND} · ${SITE}`,
  ].join("\n");

  return { subject, html, text };
}
