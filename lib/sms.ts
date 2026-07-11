/**
 * Minimal SMS send via the Twilio REST API — the SMS analogue of the Resend
 * email path in lib/customer/email.ts. Deliberately dependency-free (a direct
 * fetch, no SDK) and LAZY: env is read at call time, so build / typecheck / lint
 * run with none present.
 *
 * Configured by three envs (all required to send):
 *   TWILIO_ACCOUNT_SID   – the account SID (starts "AC…")
 *   TWILIO_AUTH_TOKEN    – the account auth token
 *   TWILIO_FROM          – the sending number in E.164 (e.g. "+61…") or a
 *                          Messaging Service SID ("MG…")
 *
 * When ANY is missing this is a silent no-op — exactly like the FCM push
 * (notifyNewOrder) — so order notifications degrade to email-only (or nothing)
 * rather than erroring. Never called on the money path directly; callers treat
 * it as best-effort.
 */
export function smsConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM,
  );
}

export async function sendSms(to: string, body: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  // No-op when unconfigured (parity with the push path) — the caller stays
  // best-effort and email still goes out.
  if (!sid || !token || !from) return;

  const params = new URLSearchParams({ To: to, Body: body });
  // A Messaging Service SID uses MessagingServiceSid; a plain number uses From.
  if (from.startsWith("MG")) params.set("MessagingServiceSid", from);
  else params.set("From", from);

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    },
  );

  if (!response.ok) {
    throw new Error(`Twilio send failed with status ${response.status}.`);
  }
}
