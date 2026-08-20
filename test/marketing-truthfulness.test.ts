import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Public copy may only claim capabilities that exist (audit P15).
 *
 * The standard was already written down in two places — `lib/marketing-content.ts`
 * ("no invented capabilities, ratings, or numbers") and `content/voice.md` — and
 * a full FeatureRow selling an unbuilt Google Gemini ordering integration
 * shipped anyway, complete with a mocked "✓ Placed. The kitchen has it."
 * A stated standard with nothing enforcing it is how that recurs.
 *
 * Two reasons this is worth a test rather than care. `app/robots.ts`
 * deliberately admits GPTBot, ClaudeBot and PerplexityBot, so a false claim
 * does not just sit on a page — it propagates into AI answers and is then
 * repeated back by systems the venue does not control. And the product is
 * positioned for Australia, where misleading representations about what a
 * service does are a consumer-law exposure, not a marketing quibble.
 *
 * These assert ABSENCE, which is a blunt instrument, so each banned term is one
 * whose only honest use would be a claim we cannot back. Adding a real
 * integration means adding the dependency AND deleting its line here — the
 * deletion is the point at which someone has to look at whether it is true.
 */

/**
 * PUBLISHED surfaces only.
 *
 * content/voice.md is deliberately NOT here. It is the authoring guide, and its
 * rules have to NAME the claims they ban ("never say commission-free") — so
 * scanning it flags the prohibition as though it were the violation, and the
 * tempting "fix" is to weaken the rule. test/authz-coverage.test.ts learned the
 * same lesson from the other direction: prose must never be able to satisfy an
 * assertion, and it must not be able to break one either.
 */
const PUBLIC_COPY = ["app/_landing/landing.tsx", "lib/marketing-content.ts"];

/** term -> what would have to exist in the repo for the claim to be honest. */
const UNBUILT_CAPABILITIES: { term: RegExp; requires: string }[] = [
  {
    term: /\bgemini\b/i,
    requires:
      "a Google/Gemini SDK dependency and an agent-reachable order endpoint. There is neither: package.json has no google/gemini/genai package, and placeOrder is a 'use server' action reachable only from the venue storefront.",
  },
  {
    term: /\bai-plugin\b|\bMCP server\b/i,
    requires:
      "a .well-known/ai-plugin.json or an MCP endpoint. app/.well-known serves only apple-app-site-association and assetlinks.json.",
  },
  {
    term: /\bcommission[- ]free\b/i,
    requires:
      "a zero platform fee. lib/stripe.ts charges 1.75% + $0.30 (APPLICATION_FEE_BPS = 175).",
  },
];

describe("public copy claims only what is built", () => {
  const source = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

  it("reads the copy files it claims to", () => {
    // Guards the scan — an absence assertion over an empty string always passes.
    for (const file of PUBLIC_COPY) {
      expect(source(file).length, file).toBeGreaterThan(500);
    }
  });

  for (const { term, requires } of UNBUILT_CAPABILITIES) {
    it(`makes no ${term.source} claim`, () => {
      const offenders = PUBLIC_COPY.filter((f) => term.test(source(f)));
      expect(
        offenders,
        `Public copy claims a capability the repo does not have. ` +
          `To make this claim honest you would need ${requires}\n` +
          offenders.map((f) => `  ${f}`).join("\n"),
      ).toEqual([]);
    });
  }

  it("has no dependency that would make an agent-ordering claim honest", () => {
    // The other half: if someone adds the SDK, this test stops being the reason
    // the claim is banned, and the list above has to be revisited deliberately.
    const pkg = JSON.parse(source("package.json"));
    const deps = Object.keys({
      ...pkg.dependencies,
      ...pkg.devDependencies,
    });
    expect(
      deps.filter((d) => /google|gemini|genai|modelcontextprotocol/i.test(d)),
      "A Gemini/MCP dependency appeared — revisit UNBUILT_CAPABILITIES above " +
        "rather than leaving the ban in place by inertia.",
    ).toEqual([]);
  });

  it("still advertises the payment methods that DO exist", () => {
    // The counterweight. Stripping claims until the page says nothing is not a
    // fix — Apple Pay, Google Pay and PayTo are all really wired up, and the
    // landing page should keep saying so.
    const landing = source("app/_landing/landing.tsx");
    expect(landing).toContain("PayTo");
    expect(landing).toMatch(/Apple Pay/i);
  });
});
