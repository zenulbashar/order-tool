import { describe, expect, it } from "vitest";

import {
  acceptsReadySubscription,
  buildPushPayload,
  parseWebPushSubscription,
  serialiseWebPushSubscription,
} from "@/lib/web-push-core";

const good = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
  keys: {
    p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
    auth: "tBHItJI5svbpez7KI4CCXg",
  },
};

describe("Web Push subscription parsing", () => {
  it("accepts a browser subscription as JSON text or object", () => {
    expect(parseWebPushSubscription(JSON.stringify(good))).toEqual(good);
    expect(parseWebPushSubscription(good)).toEqual(good);
  });

  it("refuses non-https endpoints, missing or malformed keys, and junk", () => {
    expect(parseWebPushSubscription({ ...good, endpoint: "http://x.example/1" })).toBeNull();
    expect(parseWebPushSubscription({ ...good, endpoint: "not a url" })).toBeNull();
    expect(parseWebPushSubscription({ endpoint: good.endpoint })).toBeNull();
    expect(parseWebPushSubscription({ ...good, keys: { p256dh: "short", auth: good.keys.auth } })).toBeNull();
    expect(parseWebPushSubscription({ ...good, keys: { p256dh: good.keys.p256dh, auth: "has spaces!" } })).toBeNull();
    expect(parseWebPushSubscription("fcm-device-token-abcdef")).toBeNull();
    expect(parseWebPushSubscription(null)).toBeNull();
    expect(parseWebPushSubscription("x".repeat(5000))).toBeNull();
  });

  it("serialises to a canonical form regardless of key order", () => {
    const reordered = { keys: { auth: good.keys.auth, p256dh: good.keys.p256dh }, endpoint: good.endpoint };
    expect(serialiseWebPushSubscription(reordered)).toBe(serialiseWebPushSubscription(good));
  });
});

describe("push payload", () => {
  it("bounds every field", () => {
    const payload = JSON.parse(
      buildPushPayload({
        title: "t".repeat(200),
        body: "b".repeat(500),
        url: "https://x.example/" + "p".repeat(900),
        tag: "order-1",
      }),
    );
    expect(payload.title.length).toBe(80);
    expect(payload.body.length).toBe(200);
    expect(payload.url.length).toBe(512);
    expect(payload.tag).toBe("order-1");
  });
});

describe("acceptsReadySubscription", () => {
  it("accepts a paid order the kitchen is still working on", () => {
    expect(acceptsReadySubscription("confirmed", "new")).toBe(true);
    expect(acceptsReadySubscription("confirmed", "preparing")).toBe(true);
    expect(acceptsReadySubscription("partially_refunded", "preparing")).toBe(true);
  });

  it("rejects unpaid, refunded, ready and completed orders", () => {
    expect(acceptsReadySubscription("pending_payment", "new")).toBe(false);
    expect(acceptsReadySubscription("payment_failed", "new")).toBe(false);
    expect(acceptsReadySubscription("refunded", "preparing")).toBe(false);
    expect(acceptsReadySubscription("confirmed", "ready")).toBe(false);
    expect(acceptsReadySubscription("confirmed", "completed")).toBe(false);
  });
});
