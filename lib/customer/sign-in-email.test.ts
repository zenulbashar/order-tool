import { describe, expect, it } from "vitest";

import { renderCustomerSignInEmail } from "./sign-in-email";

const URL =
  "https://prompt2eat.com/corner-cafe/account/verify?token=abc123&foo=bar";

describe("renderCustomerSignInEmail", () => {
  it("is venue-branded — venue name in the subject/body, not Prompt2Eat", () => {
    const { subject, html, text } = renderCustomerSignInEmail({
      venueName: "Corner Café",
      brandColor: "#111827",
      logoUrl: null,
      url: URL,
    });
    expect(subject).toBe("Sign in to Corner Café");
    expect(html).toContain("View your orders at Corner Café");
    expect(html).toContain("#111827"); // brand as the accent
    expect(html).toContain("ordering powered by Prompt2Eat"); // platform attribution only
    expect(text).toContain("Corner Café");
  });

  it("picks a WCAG-readable label colour for the brand button", () => {
    // Dark brand → cream label.
    expect(
      renderCustomerSignInEmail({
        venueName: "V",
        brandColor: "#111827",
        logoUrl: null,
        url: URL,
      }).html,
    ).toContain("color:#FFFDF8");
    // Light brand → ink label.
    expect(
      renderCustomerSignInEmail({
        venueName: "V",
        brandColor: "#f4d03f",
        logoUrl: null,
        url: URL,
      }).html,
    ).toContain("color:#16241C");
  });

  it("shows the logo when present, else a brand initial tile", () => {
    const withLogo = renderCustomerSignInEmail({
      venueName: "Corner Café",
      brandColor: "#111827",
      logoUrl: "https://cdn.example/logo.png",
      url: URL,
    }).html;
    expect(withLogo).toContain('src="https://cdn.example/logo.png"');

    const noLogo = renderCustomerSignInEmail({
      venueName: "Corner Café",
      brandColor: "#111827",
      logoUrl: null,
      url: URL,
    }).html;
    expect(noLogo).toContain(">C</span>"); // initial tile
  });

  it("HTML-escapes the venue name and the URL", () => {
    const html = renderCustomerSignInEmail({
      venueName: "A & <B>",
      brandColor: "#111827",
      logoUrl: null,
      url: URL,
    }).html;
    expect(html).toContain("A &amp; &lt;B&gt;");
    expect(html).toContain("token=abc123&amp;foo=bar");
    expect(html).not.toContain("token=abc123&foo=bar"); // raw & would be a bug
  });

  it("falls back to an ink accent for an unparseable brand colour", () => {
    const html = renderCustomerSignInEmail({
      venueName: "V",
      brandColor: "not-a-colour",
      logoUrl: null,
      url: URL,
    }).html;
    expect(html).toContain("#16241C"); // ink accent fallback
  });
});
