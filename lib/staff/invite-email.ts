import "server-only";

/**
 * Staff invitation email (M5 / audit F4). Reuses the SAME Resend credentials
 * as every other send path (RESEND_API_KEY / EMAIL_FROM), so no new env is
 * required, and is a silent NO-OP when they are unset — the invite link is
 * also returned to the inviter in the UI, so an unconfigured mailer degrades
 * to "copy the link" rather than blocking staff onboarding entirely.
 *
 * Unlike the diner emails this one is PLATFORM-branded, not venue-branded:
 * the recipient is being asked to trust a management invitation, and
 * disguising that as a restaurant's own mail would be the wrong signal.
 *
 * Never throws — a mail failure must not fail the invitation, which is
 * already durable in the database by the time this runs.
 */
export async function sendStaffInviteEmail(opts: {
  to: string;
  venueName: string;
  inviteUrl: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return;

  const subject = `You've been invited to manage ${opts.venueName} on Prompt2Eat`;
  const text = [
    `You've been invited to help manage ${opts.venueName} on Prompt2Eat.`,
    "",
    "Accept the invitation:",
    opts.inviteUrl,
    "",
    "This link expires in 7 days and can be used once. You'll need to sign in",
    "with this email address to accept it.",
    "",
    "If you weren't expecting this, you can ignore this email.",
  ].join("\n");

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: opts.to, subject, text }),
    });
    if (!response.ok) {
      console.error(
        `[staff-invite] Resend send failed with status ${response.status}.`,
      );
    }
  } catch (error) {
    console.error("[staff-invite] invite email failed to send:", error);
  }
}
