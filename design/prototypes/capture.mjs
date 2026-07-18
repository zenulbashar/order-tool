/**
 * Per-tile screenshot harness for the responsive design prototypes.
 *
 * Loads a prototype HTML at each Tailwind-aligned breakpoint (+ the native
 * WebView), then writes:
 *   - home-full-<bp>.png      full-document overview (fixed chrome hidden)
 *   - home-viewport-<bp>.png  viewport shot WITH the fixed cart bar / FAB pinned
 *   - home-<tile>-<bp>.png     one crop per [data-tile] that is visible at <bp>
 * into design/design_handoff_prompt2eat/blocks/<board>/.
 *
 * Uses the pre-installed Chromium via playwright-core (no browser download).
 * Run from a dir where `playwright-core` resolves, e.g.:
 *   npm i playwright-core        # once
 *   node capture.mjs design/prototypes/diner/diner-home.html diner home
 *
 * argv[2] = prototype path (relative to repo root)   default: diner/diner-home.html
 * argv[3] = board folder under blocks/               default: diner
 * argv[4] = filename prefix                          default: home
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import path from "node:path";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const EXECUTABLE =
  process.env.P2E_CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const rel = process.argv[2] || "design/prototypes/diner/diner-home.html";
const board = process.argv[3] || "diner";
const prefix = process.argv[4] || "home";

const PAGE = "file://" + path.join(REPO, rel);
const OUT = path.join(REPO, "design/design_handoff_prompt2eat/blocks", board);
mkdirSync(OUT, { recursive: true });

const BREAKPOINTS = [
  { name: "mobile",  width: 390,  height: 844,  native: false },
  { name: "tablet",  width: 768,  height: 1024, native: false },
  { name: "laptop",  width: 1280, height: 800,  native: false },
  { name: "desktop", width: 1536, height: 960,  native: false },
  { name: "native",  width: 390,  height: 844,  native: true  },
];

const browser = await chromium.launch({
  executablePath: EXECUTABLE,
  args: ["--no-sandbox", "--force-color-profile=srgb"],
});
let full = 0, tiles = 0;

for (const bp of BREAKPOINTS) {
  const ctx = await browser.newContext({
    viewport: { width: bp.width, height: bp.height },
    deviceScaleFactor: 2,
    reducedMotion: "reduce", // freeze animations -> deterministic stills
  });
  const page = await ctx.newPage();
  await page.goto(PAGE + (bp.native ? "?native=1" : ""), { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(350);

  // clean full-document overview (hide fixed chrome so it doesn't land mid-page)
  await page.$$eval(".concierge-fab,.cartbar", (els) => els.forEach((e) => (e.style.display = "none")));
  await page.screenshot({ path: path.join(OUT, `${prefix}-full-${bp.name}.png`), fullPage: true });
  full++;
  // realistic viewport shot with the fixed chrome pinned to the bottom
  await page.$$eval(".concierge-fab,.cartbar", (els) => els.forEach((e) => (e.style.display = "")));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(80);
  await page.screenshot({ path: path.join(OUT, `${prefix}-viewport-${bp.name}.png`) });
  full++;

  // one crop per visible [data-tile]
  const ids = await page.$$eval("[data-tile]", (els) => els.map((e) => e.getAttribute("data-tile")));
  for (const id of ids) {
    const el = await page.$(`[data-tile="${id}"]`);
    if (!el) continue;
    const box = await el.boundingBox();
    const visible = await el.evaluate((n) => {
      const s = getComputedStyle(n);
      return s.display !== "none" && s.visibility !== "hidden" && n.getClientRects().length > 0;
    });
    if (!box || !visible || box.width < 2 || box.height < 2) continue;
    await el.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(60);
    try {
      await el.screenshot({ path: path.join(OUT, `${prefix}-${id}-${bp.name}.png`) });
      tiles++;
    } catch (e) {
      console.warn(`skip ${id}@${bp.name}: ${e.message.split("\n")[0]}`);
    }
  }
  console.log(`✓ ${bp.name} (${bp.width}px)`);
  await ctx.close();
}

await browser.close();
console.log(`\nDone — ${full} full/viewport + ${tiles} per-tile PNGs → ${OUT}`);
