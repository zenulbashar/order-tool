import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  guardSignInSend,
  SignInRateLimitError,
} from "@/lib/auth-send-limit";
import { emailKey, type RateLimitResult } from "@/lib/rate-limit";

const ALLOW = { success: true, remaining: 1, reset: 0 };
const DENY = { success: false, remaining: 0, reset: 0 };

/**
 * A checker that denies only the named buckets. Typed explicitly rather than
 * inferred so `.mock.calls` keeps both arguments — the tests below assert on the
 * KEY as well as the bucket name.
 */
function checker(deny: string[] = []) {
  return vi.fn<
    (name: "authSendIp" | "authSendEmail", key: string) => Promise<RateLimitResult>
  >(async (name) => (deny.includes(name) ? DENY : ALLOW));
}

/**
 * Audit S2. The sign-in form's limiter is skippable — Auth.js exposes the Resend
 * provider at POST /api/auth/signin/resend and its CSRF token is freely
 * fetchable — so the limit has to also live at the send itself, which is the one
 * point every path goes through.
 */
describe("guardSignInSend", () => {
  it("allows a send when both dimensions are under limit", async () => {
    const check = checker();
    await expect(
      guardSignInSend("owner@example.com", "1.2.3.4", check),
    ).resolves.toBeUndefined();
    expect(check).toHaveBeenCalledTimes(2);
  });

  it("blocks when the IP has sent too many, whatever the address", async () => {
    // One IP must not be able to spam many inboxes.
    await expect(
      guardSignInSend("owner@example.com", "1.2.3.4", checker(["authSendIp"])),
    ).rejects.toBeInstanceOf(SignInRateLimitError);
  });

  it("blocks when the inbox has received too many, whatever the IP", async () => {
    // One inbox must not be floodable from many IPs.
    await expect(
      guardSignInSend("owner@example.com", "9.9.9.9", checker(["authSendEmail"])),
    ).rejects.toBeInstanceOf(SignInRateLimitError);
  });

  it("uses the send-specific buckets, not the form's", async () => {
    // Sharing authEmail/authIp with app/signin/actions.ts would double-count
    // every legitimate attempt and halve the real limit.
    const check = checker();
    await guardSignInSend("owner@example.com", "1.2.3.4", check);
    const names = check.mock.calls.map(([name]) => name);
    expect(names).toContain("authSendIp");
    expect(names).toContain("authSendEmail");
    expect(names).not.toContain("authIp");
    expect(names).not.toContain("authEmail");
  });

  it("keys the inbox limit on the hash, never the raw address", async () => {
    const check = checker();
    await guardSignInSend("owner@example.com", "1.2.3.4", check);
    const emailCall = check.mock.calls.find(
      ([name]) => name === "authSendEmail",
    );
    expect(emailCall?.[1]).toBe(emailKey("owner@example.com"));
    expect(emailCall?.[1]).not.toContain("owner@example.com");
  });

  it("fails OPEN, because checkRateLimit reports success on any trouble", async () => {
    // An unconfigured store, a Redis error, or a call past the 1s timeout all
    // resolve success:true. A limiter outage must not lock owners out.
    await expect(
      guardSignInSend("owner@example.com", "1.2.3.4", checker()),
    ).resolves.toBeUndefined();
  });

  it("is actually wired into the provider's send path, before the send", () => {
    // A correct guard nobody calls is worth nothing — that is precisely how S4's
    // fix could be deleted with a green suite. Pinned at the source level
    // because instantiating NextAuth here would mock away the very wiring under
    // test. Order matters too: guarding after the fetch would still mail the
    // link.
    const source = readFileSync(join(process.cwd(), "lib", "auth.ts"), "utf8");
    const body = source.slice(source.indexOf("async sendVerificationRequest"));
    const guard = body.indexOf("guardSignInSend(");
    const send = body.indexOf("api.resend.com");

    expect(guard, "lib/auth.ts must call guardSignInSend").toBeGreaterThan(-1);
    expect(send, "sendVerificationRequest should still post to Resend").toBeGreaterThan(-1);
    expect(guard, "the guard must run BEFORE the email is sent").toBeLessThan(send);
  });

  it("says nothing about whether the address exists", async () => {
    // The message reaches the user through Auth.js's error redirect, so it must
    // not become an account-enumeration oracle.
    let message = "";
    try {
      await guardSignInSend(
        "owner@example.com",
        "1.2.3.4",
        checker(["authSendEmail"]),
      );
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toBe("");
    expect(message).not.toContain("owner@example.com");
    expect(message.toLowerCase()).not.toMatch(/exist|unknown|found/);
  });
});
