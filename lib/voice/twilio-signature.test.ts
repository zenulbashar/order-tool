import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { twilioSignature, verifyTwilioSignature } from "./twilio-signature";

/**
 * Twilio's documented scheme: the full request URL, then every POST parameter
 * appended as key+value in sorted key order, HMAC-SHA1 with the auth token,
 * base64. The voice webhooks refuse anything else, so a forged request cannot
 * drive a call or send a text. The expected value is computed here from the
 * documented recipe, independently of the implementation's own concatenation.
 */
const URL = "https://mycompany.com/myapp.php?foo=1&bar=2";
const PARAMS = {
  CallSid: "CA1234567890ABCDE",
  Caller: "+12349013030",
  Digits: "1234",
  From: "+12349013030",
  To: "+18005551212",
};
const TOKEN = "12345";
const EXPECTED = createHmac("sha1", TOKEN)
  .update(
    URL +
      "CallSid" + PARAMS.CallSid +
      "Caller" + PARAMS.Caller +
      "Digits" + PARAMS.Digits +
      "From" + PARAMS.From +
      "To" + PARAMS.To,
  )
  .digest("base64");

describe("Twilio request signature", () => {
  it("follows Twilio's documented recipe (URL + sorted key/value pairs, HMAC-SHA1, base64)", () => {
    expect(twilioSignature(URL, PARAMS, TOKEN)).toBe(EXPECTED);
    expect(verifyTwilioSignature(EXPECTED, URL, PARAMS, TOKEN)).toBe(true);
    // Parameter order in the request must not matter — only sorted key order.
    expect(twilioSignature(URL, { To: PARAMS.To, CallSid: PARAMS.CallSid, Caller: PARAMS.Caller, Digits: PARAMS.Digits, From: PARAMS.From }, TOKEN)).toBe(EXPECTED);
  });

  it("rejects a changed parameter, URL, token, or a missing header", () => {
    expect(verifyTwilioSignature(EXPECTED, URL, { ...PARAMS, Digits: "9999" }, TOKEN)).toBe(false);
    expect(verifyTwilioSignature(EXPECTED, "https://mycompany.com/other", PARAMS, TOKEN)).toBe(false);
    expect(verifyTwilioSignature(EXPECTED, URL, PARAMS, "wrong")).toBe(false);
    expect(verifyTwilioSignature(null, URL, PARAMS, TOKEN)).toBe(false);
    expect(verifyTwilioSignature(EXPECTED, URL, PARAMS, "")).toBe(false);
  });
});
