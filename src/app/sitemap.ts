import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/seo";
import { claimedBooths } from "@/lib/economy";
import { CATEGORIES } from "@/lib/config";
import { GAMES } from "@/lib/arcade";
import { LANDINGS } from "@/lib/landings";

export const revalidate = 3600;

/** When the copy on the static pages last changed. Bump it when you edit them: Google stops trusting lastmod dates that
 *  move on every fetch. */
const CONTENT_UPDATED = new Date("2026-10-29T00:00:00Z");

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = await siteOrigin();
  const booths = await claimedBooths().catch(() => []);
  const newest = booths.reduce((m, b) => Math.max(m, b.updatedAt ?? b.claimedAt ?? 0), 0);
  const fresh = new Date(Math.max(newest, CONTENT_UPDATED.getTime()));
  const page = (path: string, priority: number, changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"], lastModified: Date = CONTENT_UPDATED) =>
    ({ url: `${origin}${path}`, lastModified, changeFrequency, priority });
  return [
    page("/", 1, "daily", fresh),
    ...Object.keys(LANDINGS).map((slug) => page(`/${slug}`, 0.9, "weekly")),
    page("/app", 0.8, "daily", fresh),
    page("/app/directory", 0.8, "daily", fresh),
    ...Object.keys(CATEGORIES).map((c) => page(`/app/directory/${c}`, 0.7, "daily", fresh)),
    page("/app/how-it-works", 0.7, "monthly"),
    page("/app/rankings", 0.6, "daily", fresh),
    page("/app/seasons", 0.5, "weekly"),
    page("/app/arcade", 0.6, "weekly"),
    ...Object.keys(GAMES).map((g) => page(`/app/arcade/${g}`, 0.4, "monthly")),
    ...booths.map((b) => page(`/app/booth/${b.id}`, 0.6, "weekly", new Date(b.updatedAt ?? b.claimedAt ?? CONTENT_UPDATED.getTime()))),
  ];
}
