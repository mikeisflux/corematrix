import { NextResponse } from "next/server";
import { sql, gte } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { siteStats } from "@/lib/economy";
import { onlineCount } from "@/lib/realtime";
import { dayKey, daysAgoKey } from "@/lib/util";
import { TOTAL_PLOTS } from "@/lib/config";

export const dynamic = "force-dynamic";

/** Public, site-wide numbers. Transparent by design: visitors can see the city is alive. */
export async function GET() {
  await ensureMigrated();
  const s = await siteStats();
  const yesterday = daysAgoKey(1);
  const weekAgo = daysAgoKey(6);
  const [y] = await db.select().from(schema.siteDaily).where(sql`day = ${yesterday}`);
  const [today] = await db.select().from(schema.siteDaily).where(sql`day = ${dayKey()}`);
  const [w] = await db
    .select({ visits: sql<number>`sum(visits)`, clicks: sql<number>`sum(outbound_clicks)`, claims: sql<number>`sum(claims)`, revenue: sql<number>`sum(revenue_cents)` })
    .from(schema.siteDaily)
    .where(gte(schema.siteDaily.day, weekAgo));
  const [pv] = await db
    .select({ y: sql<number>`sum(case when day = ${yesterday} then views else 0 end)`, w: sql<number>`sum(case when day >= ${weekAgo} then views else 0 end)`, t: sql<number>`sum(views)`, imp: sql<number>`sum(impressions)` })
    .from(schema.plotDaily);
  const [clk] = await db.select({ t: sql<number>`sum(outbound_clicks)` }).from(schema.siteDaily);
  return NextResponse.json({
    online: Math.max(1, onlineCount()),
    totalPlots: TOTAL_PLOTS,
    claimed: s.claimed,
    totalSalesCents: s.totalSalesCents,
    totalValueCents: s.totalValueCents,
    visits: { today: today?.visits ?? 0, yesterday: y?.visits ?? 0, last7d: Number(w?.visits ?? 0), total: s.totalViews },
    buildingViews: { yesterday: Number(pv?.y ?? 0), last7d: Number(pv?.w ?? 0), total: Number(pv?.t ?? 0) },
    impressions: { total: Number(pv?.imp ?? 0) },
    websiteClicks: { today: today?.outboundClicks ?? 0, yesterday: y?.outboundClicks ?? 0, last7d: Number(w?.clicks ?? 0), total: Number(clk?.t ?? 0) },
    claims7d: Number(w?.claims ?? 0),
  });
}
