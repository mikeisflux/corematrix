import { NextResponse } from "next/server";
import { activeBillboards, claimedPlots, recentEvents, siteStats } from "@/lib/economy";
import { onlineCount } from "@/lib/realtime";
import { TOTAL_PLOTS } from "@/lib/config";
import { trendingScores } from "@/lib/analytics";
import { featuredPlots } from "@/lib/seasons";

export const dynamic = "force-dynamic";

export async function GET() {
  const [plots, stats, events, billboards, trend, featured] = await Promise.all([claimedPlots(), siteStats(), recentEvents(40), activeBillboards(), trendingScores(7), featuredPlots(6)]);
  return NextResponse.json(
    {
      plots: plots.map((p) => ({
        id: p.id,
        name: p.name,
        tagline: p.tagline,
        website: p.website,
        hasLogo: !!p.logoUrl,
        color: p.color,
        accent: p.accent,
        style: p.style,
        shape: p.shape,
        floors: p.floors,
        roof: p.roof,
        district: p.district,
        tier: p.tier,
        valueCents: p.valueCents,
        totalViews: p.totalViews,
        totalClicks: p.totalClicks,
        claimedAt: p.claimedAt,
        salesCount: p.salesCount,
        views7d: trend.get(p.id)?.views ?? 0,
        clicks7d: trend.get(p.id)?.clicks ?? 0,
      })),
      stats: { ...stats, online: onlineCount(), totalPlots: TOTAL_PLOTS },
      events,
      featured,
      billboards: billboards.map((b) => ({ id: b.id, slot: b.slot, headline: b.headline, body: b.body, website: b.website, imageUrl: b.imageUrl, color: b.color, plotId: b.plotId })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
