/**
 * Everything the hall needs to draw its first frame: the claimed booths with their art, the site stats, the recent
 * events, the featured booths and the aisle banners. /api/hall serves it to a running hall; /app renders it straight
 * into the page so the floor is populated before any request has been made from the browser.
 */
import { isHouseBooth } from "@/lib/config";
import { artFlags, artLinks } from "@/lib/art";
import { activeBillboards, claimedBooths, recentEvents, siteStats, logoStamp, TOTAL_BOOTHS } from "@/lib/economy";
import { onlineCount } from "@/lib/realtime";
import { trendingScores } from "@/lib/analytics";
import { featuredBooths } from "@/lib/seasons";

export type HallSnapshot = Awaited<ReturnType<typeof hallSnapshot>>;

export async function hallSnapshot() {
  const [booths, stats, events, billboards, trend, featured, art, links] = await Promise.all([claimedBooths(), siteStats(), recentEvents(40), activeBillboards(), trendingScores(7), featuredBooths(6), artFlags(), artLinks()]);
  return {
      booths: booths.map((p) => ({
        id: p.id,
        name: p.name,
        tagline: p.tagline,
        website: p.website,
        hasLogo: !!p.logoUrl,
        logoVersion: logoStamp(p),
        freeValueCents: p.freeValueCents,
        color: p.color,
        accent: p.accent,
        style: p.style,
        cloth: p.cloth,
        bannerHeight: p.bannerHeight,
        bookSlots: p.bookSlots,
        house: isHouseBooth(p.id),
        art: art.get(p.id),
        artLinks: links.get(p.id),
        category: p.category,
        size: p.size,
        kind: p.kind,
        label: p.label,
        hall: p.hall,
        tier: p.tier,
        valueCents: p.valueCents,
        totalViews: p.totalViews,
        totalClicks: p.totalClicks,
        claimedAt: p.claimedAt,
        salesCount: p.salesCount,
        views7d: trend.get(p.id)?.views ?? 0,
        clicks7d: trend.get(p.id)?.clicks ?? 0,
      })),
      stats: { ...stats, online: onlineCount(), totalBooths: TOTAL_BOOTHS },
      events,
      featured,
      billboards: billboards.map((b) => ({ id: b.id, slot: b.slot, headline: b.headline, body: b.body, website: b.website, imageUrl: b.imageUrl, color: b.color, boothId: b.boothId })),
    };
}
