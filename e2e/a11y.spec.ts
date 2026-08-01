import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Automated accessibility checks (M7 / audit F10), run in CI on every PR.
 *
 * Scope is the ANONYMOUS marketing / SEO surface — the same pages the smoke
 * suite covers — because CI has no database and the storefront and dashboard
 * cannot render without one. That is a real limit, not a claim of full
 * coverage: see docs/ops/Testing.md. The venue-branded surfaces are guarded
 * from the other direction, by the WCAG contrast gate that now runs at brand
 * save time.
 *
 * Axe finds roughly a third of WCAG issues — it cannot judge focus order,
 * meaningful alt text, or whether a heading structure makes sense. A green
 * run here means "no machine-detectable violations", and the manual
 * screen-reader pass in docs/audit/Accessibility.md remains the other half.
 */

/** WCAG 2.1 A + AA — the conformance target the audit measures against. */
const WCAG_AA_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const PAGES = [
  { name: "landing", path: "/?preview=landing" },
  { name: "sign-in", path: "/signin" },
  { name: "learn hub", path: "/learn" },
  { name: "learn article", path: "/learn/ai-ordering-for-restaurants" },
];

test.describe("accessibility (anonymous marketing surface)", () => {
  for (const page_ of PAGES) {
    test(`${page_.name} has no WCAG A/AA violations`, async ({ page }) => {
      await page.goto(page_.path);
      // Wait for the heading so the scan sees rendered content, not a shell.
      await expect(page.locator("h1").first()).toBeVisible();

      const results = await new AxeBuilder({ page })
        .withTags(WCAG_AA_TAGS)
        .analyze();

      // Report the rule id and the offending selector — a bare count is
      // useless when the run is red and nobody can reproduce it locally.
      const summary = results.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        nodes: violation.nodes.map((node) => node.target.join(" ")),
      }));
      expect(summary, JSON.stringify(summary, null, 2)).toEqual([]);
    });
  }

  test("the skip link is the first Tab stop and moves focus", async ({
    page,
  }) => {
    // F10's one clean Level A failure, fixed in M0 — pinned here so it can't
    // silently regress. Axe cannot detect a MISSING skip link, only a broken
    // one, so this needs its own assertion.
    await page.goto("/?preview=landing");
    await page.keyboard.press("Tab");

    const focused = page.locator(":focus");
    await expect(focused).toBeVisible();
    await expect(focused).toHaveText(/skip to (main )?content/i);

    await focused.press("Enter");
    // Focus must actually LAND on the main region — an anchor that only
    // changes the URL hash leaves keyboard users where they were.
    const focusedId = await page.evaluate(() => document.activeElement?.id);
    expect(focusedId).toBe("main-content");
  });
});
