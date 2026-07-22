import { renderCustomerSignInEmail } from "./sign-in-email";

/**
 * Customer magic-link email (#7), sent via the Resend REST API directly.
 *
 * This is DELIBERATELY NOT the Auth.js Resend provider (lib/auth.ts) — the
 * customer flow is firewalled from owner auth, so it has its own send path. It
 * reuses the SAME already-configured credentials (RESEND_API_KEY / EMAIL_FROM),
 * so there is no new required env. Lazy: env is read at call time, so
 * build / typecheck / lint run with none present (same contract as lib/stripe.ts
 * and the Neon pool).
 *
 * Rendered VENUE-branded (name + brand accent + logo), never Prompt2Eat's own
 * identity — the owner↔diner firewall (see lib/customer/sign-in-email.ts).
 */
export async function sendCustomerMagicLinkEmail(opts: {
  to: string;
  venueName: string;
  brandColor: string;
  logoUrl: string | null;
  url: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    throw new Error(
      "RESEND_API_KEY / EMAIL_FROM are not set — cannot send the customer magic link.",
    );
  }

  const { subject, html, text } = renderCustomerSignInEmail({
    venueName: opts.venueName,
    brandColor: opts.brandColor,
    logoUrl: opts.logoUrl,
    url: opts.url,
  });

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: opts.to, subject, html, text }),
  });

  if (!response.ok) {
    throw new Error(`Resend send failed with status ${response.status}.`);
  }
}

/**
 * Best-effort order-notification email (order confirmed / ready). Reuses the
 * SAME Resend credentials as the magic link. Unlike the magic link — which is
 * required and throws when unconfigured — this is a NOTIFICATION, so it is a
 * silent no-op when RESEND_API_KEY / EMAIL_FROM are unset (parity with the SMS
 * and push paths). Plain-text only; the caller composes the lines.
 */
export async function sendOrderEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      // Plain-text alternative for clients that don't render HTML.
      text: opts.text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend send failed with status ${response.status}.`);
  }
}
