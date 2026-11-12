import type { NextConfig } from "next";

// Static 3D assets and images: served by Next with max-age=0 by default, so every visit re-fetched or revalidated the
// models, the lighting map and the marketing art. Cache them for a day and refresh in the background after that,
// so a changed model still reaches everyone within a visit.
const ASSET_CACHE = "public, max-age=86400, stale-while-revalidate=2592000";

const nextConfig: NextConfig = {
  devIndicators: false,
  // the database drivers (native pg, WASM PGlite), Redis and the socket library load from node_modules as they are
  serverExternalPackages: ["pg", "@electric-sql/pglite", "ioredis", "ws", "sharp", "nsfwjs", "@tensorflow/tfjs"],
  agentRules: false,
  // "three" in the bundle is three with its deprecated Clock replaced by a Timer-backed one; see src/lib/three-shim.ts.
  turbopack: { resolveAlias: { three: "./src/lib/three-shim.ts" } },
  async headers() {
    return ["/models/:path*", "/hdri/:path*", "/marketing/:path*", "/icon-512.png"].map((source) => ({
      source,
      headers: [{ key: "Cache-Control", value: ASSET_CACHE }],
    }));
  },
};

export default nextConfig;
