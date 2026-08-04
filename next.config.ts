import type { NextConfig } from "next";

/**
 * Content-Security-Policy for the CHECKOUT route (M8b / audit §8.2).
 *
 * Why this route specifically: the January 2025 SAQ A revision adds a
 * criterion — "the merchant has confirmed that their site is not susceptible
 * to attacks from scripts that could affect the merchant's e-commerce
 * system(s)" — which per PCI SSC FAQ 1588 applies ONLY to merchants who embed
 * a third-party payment form in their own page. Prompt2Eat embeds Stripe
 * Elements, so it binds here. The policy is the control; the reasoning and
 * the full script inventory are recorded in docs/ops/PCI.md.
 *
 * Every allowed origin below is one Stripe.js itself requires. Nothing else
 * is permitted on the payment page — no analytics, tag manager, session
 * recorder or chat widget — and that absence is the point.
 *
 * KNOWN LIMITATION, recorded rather than hidden: `'unsafe-inline'` is still
 * required for script-src because Next emits inline bootstrap/hydration
 * scripts and this app has not adopted the nonce approach (which needs a
 * proxy.ts). So this constrains WHICH ORIGINS may serve scripts, but not an
 * inline script an attacker managed to inject. Tightening to nonce-based
 * `strict-dynamic` is the follow-up, and must be validated against a live
 * Stripe Elements instance.
 */
const STRIPE_JS = "https://js.stripe.com";
const STRIPE_API = "https://api.stripe.com";
// Stripe.js contacts these for fraud signals and telemetry; blocking them
// degrades Elements rather than hardening anything.
const STRIPE_NETWORK = "https://m.stripe.network https://r.stripe.com";
const STRIPE_FRAMES = `${STRIPE_JS} https://hooks.stripe.com https://m.stripe.network`;

const CHECKOUT_CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${STRIPE_JS}`,
  // Tailwind and the venue's brand variables are applied inline.
  "style-src 'self' 'unsafe-inline'",
  // Venue logos and menu photography come from the R2 public bucket over
  // https; data:/blob: cover inline SVG and locally-generated previews.
  "img-src 'self' data: blob: https:",
  `connect-src 'self' ${STRIPE_API} ${STRIPE_NETWORK}`,
  `frame-src ${STRIPE_FRAMES}`,
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  // The checkout form posts only to this origin (Server Actions).
  "form-action 'self'",
  // Nobody may frame the payment page — clickjacking a card form is the
  // obvious attack this closes.
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

/**
 * Baseline security headers for EVERY route.
 *
 * These were previously set on `/:slug/checkout` alone, which left the owner
 * dashboard, the admin console, every storefront and every API route with none.
 * The sharpest gap was `Referrer-Policy`: the customer magic link lands on
 * `/[slug]/account/verify?token=…`, and that token is a pure bearer credential.
 * Without a policy, a browser navigating from that page to any third-party
 * origin sends the FULL url — token included — in the `Referer` header.
 * `strict-origin-when-cross-origin` sends only the origin cross-site.
 *
 * `X-Frame-Options: SAMEORIGIN` rather than `DENY`, deliberately: nothing in the
 * app frames anything today (the only `frame-ancestors`/`X-Frame-Options` in the
 * repo are checkout's), but a venue embedding its own menu is a plausible future,
 * and the checkout rule below still overrides this with `DENY` where framing is
 * an actual attack. Per the Next docs, when two rules match the same path and set
 * the same key, the LAST one wins — so ordering here is load-bearing.
 */
const BASELINE_SECURITY_HEADERS = [
  /**
   * Two years, all subdomains. `preload` is deliberately omitted: it is an
   * explicit submission at hstspreload.org and is slow and painful to reverse,
   * so enrolling is the operator's call, not a side effect of this config.
   * Vercel already sends HSTS on custom domains; setting it here makes the
   * guarantee explicit and survives a move off Vercel.
   */
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Everything. Overridden per-route by any later matching rule.
        source: "/:path*",
        headers: BASELINE_SECURITY_HEADERS,
      },
      {
        // Every venue's checkout, e.g. /corner-cafe/checkout. MUST stay after
        // the baseline rule — it upgrades X-Frame-Options to DENY by overriding.
        source: "/:slug/checkout",
        headers: [
          { key: "Content-Security-Policy", value: CHECKOUT_CSP },
          // Defence in depth alongside frame-ancestors, for older browsers.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Don't leak the venue/order path to third parties on navigation.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
  // `ws` (the Neon WebSocket driver dependency) is server-only and should not
  // be bundled into the server build. `@sentry/node` must stay external too:
  // bundling breaks its OpenTelemetry internals, and the fork's default
  // externals list carries only @sentry/profiling-node.
  serverExternalPackages: ["ws", "@sentry/node"],
  experimental: {
    serverActions: {
      // The menu-photo import sends up to 3 images (~5MB each) through a Server
      // Action; the default cap is 1MB. The extract action independently
      // enforces the per-image 5MB / max-3 caps, so this only raises the
      // transport ceiling enough to fit them.
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
