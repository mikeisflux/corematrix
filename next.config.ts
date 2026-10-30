import type { NextConfig } from "next";

// Static 3D assets and images: served by Next with max-age=0 by default, so every visit re-fetched or revalidated the
// models, the lighting map and the marketing art. Cache them for a day and refresh in the background after that,
// so a changed model still reaches everyone within a visit.
const ASSET_CACHE = "public, max-age=86400, stale-while-revalidate=2592000";

const nextConfig: NextConfig = {
  devIndicators: false,
  agentRules: false,
  async headers() {
    return ["/models/:path*", "/hdri/:path*", "/marketing/:path*", "/icon-512.png"].map((source) => ({
      source,
      headers: [{ key: "Cache-Control", value: ASSET_CACHE }],
    }));
  },
};

export default nextConfig;
