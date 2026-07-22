import { describe, expect, it } from "vitest";

import { renderSignInEmail } from "./auth-email";

const URL = "https://prompt2eat.com/api/auth/callback/resend?token=abc123&email=a%40b.com";

describe("renderSignInEmail", () => {
  it("uses the Prompt2Eat brand, not the raw host, in the subject and body", () => {
    const { subject, html, text } = renderSignInEmail(URL);
    expect(subject).toBe("Sign in to Prompt2Eat");
    expect(html).toContain("Sign in to Prompt2Eat");
    // Wordmark with the amber "2" and the forest/amber brand colours.
    expect(html).toContain(">Prompt<");
    expect(html).toContain("#F4B43C"); // amber
    expect(html).toContain("#16241C"); // forest
    expect(html).toContain("prompt2eat.com");
    expect(text).toContain("Prompt2Eat");
  });

  it("links the button and fallback to the magic-link URL (HTML-escaped)", () => {
    const { html, text } = renderSignInEmail(URL);
    // '&' in the query string must be escaped inside the href attribute.
    expect(html).toContain("token=abc123&amp;email=a%40b.com");
    expect(html).not.toContain("token=abc123&email"); // raw & would be a bug
    // Plain-text keeps the usable raw URL.
    expect(text).toContain(URL);
  });

  it("includes the safe-to-ignore reassurance", () => {
    expect(renderSignInEmail(URL).html).toMatch(/safely ignore/i);
    expect(renderSignInEmail(URL).text).toMatch(/safely ignore/i);
  });
});
