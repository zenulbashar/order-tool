import { expect, test } from "@playwright/test";

/**
 * Smoke tests for the anonymous marketing / SEO surface. These guard the
 * churn-prone landing + SEO pages against render regressions and basic
 * accessibility slips, without needing a database.
 */
test.describe("marketing & SEO surface (anonymous)", () => {
  test("landing renders the brand and a heading", async ({ page }) => {
    await page.goto("/?preview=landing");
    await expect(page).toHaveTitle(/Prompt2Eat/i);
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.getByText("Prompt2Eat").first()).toBeVisible();
    await expect(page.getByRole("link").first()).toBeVisible();
  });

  test("sign-in page shows the magic-link email form", async ({ page }) => {
    await page.goto("/signin");
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    await expect(page.getByRole("button").first()).toBeVisible();
  });

  test("learn hub renders a heading and links", async ({ page }) => {
    await page.goto("/learn");
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.getByRole("link").first()).toBeVisible();
  });

  test("a learn article renders with 200 + a heading", async ({ page }) => {
    const resp = await page.goto("/learn/ai-ordering-for-restaurants");
    expect(resp?.status()).toBe(200);
    await expect(page.locator("h1").first()).toBeVisible();
  });

  test("robots.txt is served as text", async ({ page }) => {
    const resp = await page.goto("/robots.txt");
    expect(resp?.status()).toBe(200);
    expect(await resp?.text()).toMatch(/user-agent/i);
  });

  test("marketing pages set html[lang] and a non-empty title", async ({
    page,
  }) => {
    for (const path of ["/?preview=landing", "/signin", "/learn"]) {
      await page.goto(path);
      await expect(page.locator("html")).toHaveAttribute("lang", /.+/);
      expect((await page.title()).length).toBeGreaterThan(0);
    }
  });
});
