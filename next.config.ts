import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `ws` (the Neon WebSocket driver dependency) is server-only and should not
  // be bundled into the server build.
  serverExternalPackages: ["ws"],
};

export default nextConfig;
