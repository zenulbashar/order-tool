/**
 * Customer magic-link email (#7), sent via the Resend REST API directly.
 *
 * This is DELIBERATELY NOT the Auth.js Resend provider (lib/auth.ts) — the
 * customer flow is firewalled from owner auth, so it has its own send path. It
 * reuses the SAME already-configured credentials (RESEND_API_KEY / EMAIL_FROM),
 * so there is no new required env. Lazy: env is read at call time, so
 * build / typecheck / lint run with none present (same contract as lib/stripe.ts
 * and the Neon pool).
 */
export async function sendCustomerMagicLinkEmail(opts: {
  to: string;
  venueName: string;
  url: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    throw new Error(
      "RESEND_API_KEY / EMAIL_FROM are not set — cannot send the customer magic link.",
    );
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: opts.to,
      subject: `View your orders at ${opts.venueName}`,
      text: [
        `Tap the link below to view your orders at ${opts.venueName}:`,
        "",
        opts.url,
        "",
        "This link expires in 15 minutes and can be used once.",
        "If you didn't request it, you can safely ignore this email.",
      ].join("\n"),
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend send failed with status ${response.status}.`);
  }
}
