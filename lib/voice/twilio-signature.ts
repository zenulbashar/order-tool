import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Twilio request signing (X-Twilio-Signature): base64(HMAC-SHA1(auth token,
 * full request URL + every POST parameter appended as key+value in key order)).
 * Verified on every voice webhook so only Twilio can drive a call — the
 * same discipline as the Stripe and Square webhooks. Pure.
 */
export function twilioSignature(
  url: string,
  params: Record<string, string>,
  authToken: string,
): string {
  const payload =
    url +
    Object.keys(params)
      .sort()
      .map((key) => key + params[key])
      .join("");
  return createHmac("sha1", authToken).update(payload, "utf8").digest("base64");
}

export function verifyTwilioSignature(
  header: string | null,
  url: string,
  params: Record<string, string>,
  authToken: string,
): boolean {
  if (!header || !authToken) return false;
  const expected = Buffer.from(twilioSignature(url, params, authToken), "utf8");
  const given = Buffer.from(header, "utf8");
  return expected.length === given.length && timingSafeEqual(expected, given);
}
