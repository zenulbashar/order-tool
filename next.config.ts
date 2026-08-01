import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
