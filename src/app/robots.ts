import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/seo";

export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = await siteOrigin();
  return {
    rules: [{
      userAgent: "*",
      allow: ["/", "/api/og/", "/api/logo/"],
      // accounts, money and one-time links: nothing for a search result to send anyone to
      disallow: ["/admin", "/api/", "/app/dashboard", "/app/checkout", "/app/login/reset", "/app/login/verify", "/dev/"],
    }],
    sitemap: `${origin}/sitemap.xml`,
  };
}
