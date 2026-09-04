import { describe, expect, it } from "vitest";

import { escapeXml, gatherTwiml, hangupTwiml } from "./twiml";

describe("TwiML rendering", () => {
  it("escapes spoken text so menu names and model output cannot inject verbs", () => {
    const xml = gatherTwiml(['Fish & chips is $12 — say "yes" <now>'], "/api/voice/turn?state=a-b");
    expect(xml).toContain("Fish &amp; chips");
    expect(xml).toContain("&quot;yes&quot; &lt;now&gt;");
    expect(xml).not.toContain("<now>");
    expect(escapeXml("<Hangup/>")).toBe("&lt;Hangup/&gt;");
  });

  it("listens for speech after speaking, with a spoken fallback and hangup when nothing is said", () => {
    const xml = gatherTwiml(["Hi there."], "/api/voice/turn?state=x");
    expect(xml).toContain('<Gather input="speech"');
    expect(xml).toContain('action="/api/voice/turn?state=x"');
    expect(xml).toContain('actionOnEmptyResult="true"');
    expect(xml).toMatch(/<\/Gather><Say[^>]*>Sorry, I didn&apos;t catch that\. Goodbye\.<\/Say><Hangup\/><\/Response>$/);
  });

  it("hangs up after speaking when the call is over", () => {
    const xml = hangupTwiml(["Thanks, bye."]);
    expect(xml).toMatch(/<Say[^>]*>Thanks, bye\.<\/Say><Hangup\/><\/Response>$/);
    expect(xml).not.toContain("<Gather");
  });
});
