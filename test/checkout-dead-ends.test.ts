import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Silent dead ends (audit L8, L9, L10).
 *
 * Each of these is a control that looks live and does nothing. None of them
 * throws, logs, or fails a build — which is exactly why they survived.
 */
/**
 * Strip comments before scanning.
 *
 * Learned the hard way, twice, on this very file: the comment explaining WHY
 * the dead `#menu-top` scroll was removed contains "menu-top", and the comment
 * explaining why the failure branch must not call `setCodeStatus("invalid")`
 * contains that call. Both assertions failed against correct code.
 *
 * test/authz-coverage.test.ts records the same lesson from the other
 * direction — prose satisfying a security assertion. Either way: prose must
 * never be able to decide a test.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const source = (file: string) =>
  stripComments(readFileSync(join(process.cwd(), file), "utf8"));

describe("discount Apply reports failure (L8)", () => {
  /** runDiscount's own body — the file has other try/catch blocks. */
  const runDiscount = () => {
    const src = source("app/[slug]/checkout/payment-step.tsx");
    const start = src.indexOf("async function runDiscount");
    expect(start, "runDiscount not found").toBeGreaterThan(-1);
    // Ends at the next top-level function in the component.
    const end = src.indexOf("function applyCode(", start);
    return src.slice(start, end > start ? end : undefined);
  };

  it("reports failure on BOTH a false result and a throw", () => {
    // Two failure modes, two handlers. discount-actions.ts requires
    // status === "pending_payment", so after a DECLINE the order is
    // payment_failed and every Apply returns {ok:false} — that needs the else.
    // applyOrderDiscounts can also throw, and all five call sites use `void`,
    // so an escaping rejection was unhandled — that needs the catch.
    //
    // Counted rather than matched loosely: mutation-testing caught a weaker
    // version of this test, where deleting the else still passed because the
    // same constant was still referenced from the catch.
    const body = runDiscount();
    const reported = body.split("setError(RECOMPUTE_FAILED)").length - 1;
    expect(reported, "expected a report in the else AND in the catch").toBe(2);
    expect(body).toContain("} else {");
  });

  it("catches before it finallys", () => {
    // The original had `finally` alone, which runs on a throw but reports
    // nothing — the UI just went quiet.
    const body = runDiscount();
    const catchAt = body.lastIndexOf("} catch {");
    const finallyAt = body.indexOf("} finally {");
    expect(catchAt, "runDiscount needs a catch").toBeGreaterThan(-1);
    expect(catchAt).toBeLessThan(finallyAt);
  });

  it("does not claim the diner's CODE was invalid when the recompute failed", () => {
    // The tempting shortcut. setCodeStatus("invalid") would render "not a valid
    // code" for a code that may be perfectly good — a different, wrong claim.
    const body = runDiscount();
    const failure = body.slice(body.indexOf("} else {"));
    expect(failure).not.toContain('setCodeStatus("invalid")');
    expect(failure).not.toContain('setGiftCardStatus("invalid")');
  });
});

describe("storefront landing is never a dead end (L9)", () => {
  it("shows an empty-menu state on the LANDING view", () => {
    // The copy existed only in the menu branch, so a venue that skipped the
    // menu step handed out QR codes landing on "Browse by category" above
    // nothing at all.
    const storefront = source("app/[slug]/storefront.tsx");
    const landing = storefront.slice(
      storefront.indexOf("{isLanding ? (\n          <div"),
    );
    expect(landing).toContain("menu.length === 0");
    expect(landing).toContain("hasn&rsquo;t published a menu yet");
  });

  it("navigates to the menu instead of scrolling to an id in the other branch", () => {
    // StorefrontHero renders ONLY inside the landing branch; #menu-top is the
    // id of the menu branch. They are mutually exclusive, so the old
    // scrollIntoView found nothing on every venue, every time.
    const hero = source("app/[slug]/storefront-hero.tsx");
    expect(hero, "the dead scroll must be gone").not.toContain("menu-top");
    expect(hero, "View menu must be a link").toContain("href={menuUrl}");
  });

  it("carries the QR table through to the menu", () => {
    // menuHref(slug, table) — dropping the table would break the dine-in flow
    // for anyone arriving from a table code.
    expect(source("app/[slug]/storefront.tsx")).toContain(
      "menuUrl={menuHref(venue.slug, initialTable)}",
    );
  });
});

describe("the sign-in email survives the hop (L10)", () => {
  it("reads ?email= on the sign-in page", () => {
    // The landing's final CTA is a GET form posting to /signin, so the address
    // arrives in the query string. The page declared no props and never read
    // it, next to copy saying "Enter your email above to get started".
    const page = source("app/signin/page.tsx");
    expect(page).toContain("searchParams");
    expect(page).toContain("initialEmail");
  });

  it("prefills UNCONTROLLED, so the field stays editable", () => {
    // `value` would freeze it, and would also wipe what the visitor typed when
    // the form re-renders after a rate-limit error.
    const form = source("app/signin/signin-form.tsx");
    expect(form).toContain("defaultValue={initialEmail}");
    expect(form).not.toContain("value={initialEmail}");
  });
});
