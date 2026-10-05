import { NextResponse } from "next/server";
import { HOUSE_BOOTH_ID } from "@/lib/config";
import { artFlags } from "@/lib/art";
import { activeBillboards, claimedBooths, recentEvents, siteStats } from "@/lib/economy";
import { onlineCount } from "@/lib/realtime";
import { TOTAL_BOOTHS } from "@/lib/economy";
import { trendingScores } from "@/lib/analytics";
import { featuredBooths } from "@/lib/seasons";

export const dynamic = "force-dynamic";

export async function GET() {
  const [booths, stats, events, billboards, trend, featured, art] = await Promise.all([claimedBooths(), siteStats(), recentEvents(40), activeBillboards(), trendingScores(7), featuredBooths(6), artFlags()]);
  return NextResponse.json(
    {
      booths: booths.map((p) => ({
        id: p.id,
        name: p.name,
        tagline: p.tagline,
        website: p.website,
        hasLogo: !!p.logoUrl,
        logoVersion: p.updatedAt ?? 0,
        color: p.color,
        accent: p.accent,
        style: p.style,
        cloth: p.cloth,
        bannerHeight: p.bannerHeight,
        bookSlots: p.bookSlots,
        house: p.id === HOUSE_BOOTH_ID,
        art: art.get(p.id),
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
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
