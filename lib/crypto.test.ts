import { beforeAll, describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret } from "./crypto";

// A deterministic 32-byte key. The module reads it lazily on first call, so
// setting it before the tests run is enough (no import-time read).
beforeAll(() => {
  process.env.INTEGRATION_TOKEN_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("encryptSecret / decryptSecret", () => {
  it("round-trips secrets, including unicode and long tokens", () => {
    for (const plain of [
      "sk_live_abc123",
      "unïcodé 🔐 secret",
      "x".repeat(4096),
    ]) {
      expect(decryptSecret(encryptSecret(plain))).toBe(plain);
    }
  });

  it("produces the versioned 4-part format", () => {
    const parts = encryptSecret("x").split(".");
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe("v1");
  });

  it("uses a fresh IV so the same plaintext encrypts differently each time", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("throws on a tampered ciphertext (GCM authentication)", () => {
    const [v, iv, , tag] = encryptSecret("secret").split(".");
    const tampered = [
      v,
      iv,
      Buffer.from("different-ciphertext").toString("base64url"),
      tag,
    ].join(".");
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("throws on a malformed or unknown-version string", () => {
    expect(() => decryptSecret("garbage")).toThrow(/Unrecognised/);
    expect(() => decryptSecret("v2.a.b.c")).toThrow(/Unrecognised/);
  });
});
