/**
 * WhatsApp order notifications via the Twilio WhatsApp API — the same Twilio
 * account as lib/sms.ts, so it reuses TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN.
 * WhatsApp business-INITIATED messages (an order update, outside a 24h customer
 * window) MUST use a Meta-approved template, referenced here by a Twilio Content
 * SID per event, with variables filled at send time.
 *
 * Envs:
 *   TWILIO_WHATSAPP_FROM            – the WhatsApp sender: "whatsapp:+61…" (or a
 *                                     bare "+61…", which we prefix) or an "MG…"
 *                                     Messaging Service SID.
 *   TWILIO_WHATSAPP_CONFIRMED_SID   – Content SID (HX…) of the approved
 *                                     "order confirmed" template.
 *   TWILIO_WHATSAPP_READY_SID       – Content SID of the approved "order ready"
 *                                     template.
 *
 * The templates must accept these positional variables (ContentVariables):
 *   {{1}} = customer first name   {{2}} = venue name
 *   {{3}} = order reference       {{4}} = order URL
 *
 * A silent no-op when the account creds, the sender, or the event's Content SID
 * are unset — so callers stay best-effort and this is safe to ship before Meta
 * approval is in place.
 */
export type WhatsAppEvent = "confirmed" | "ready";

function contentSidFor(event: WhatsAppEvent): string | undefined {
  return event === "confirmed"
    ? process.env.TWILIO_WHATSAPP_CONFIRMED_SID
    : process.env.TWILIO_WHATSAPP_READY_SID;
}

export function whatsAppConfigured(event: WhatsAppEvent): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_WHATSAPP_FROM &&
      contentSidFor(event),
  );
}

/** `to` must be E.164 (e.g. "+61…"); the caller normalises via toE164(). */
export async function sendWhatsApp(
  to: string,
  event: WhatsAppEvent,
  variables: Record<string, string>,
): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  const contentSid = contentSidFor(event);
  if (!sid || !token || !from || !contentSid) return;

  const params = new URLSearchParams({
    To: `whatsapp:${to}`,
    ContentSid: contentSid,
    ContentVariables: JSON.stringify(variables),
  });
  if (from.startsWith("MG")) params.set("MessagingServiceSid", from);
  else params.set("From", from.startsWith("whatsapp:") ? from : `whatsapp:${from}`);

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
    throw new Error(`Twilio WhatsApp send failed with status ${response.status}.`);
  }
}
