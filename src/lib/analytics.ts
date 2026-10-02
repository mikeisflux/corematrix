import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { dayKey, daysAgoKey } from "@/lib/util";

type SiteBump = Partial<{
  visits: number;
  uniques: number;
  claims: number;
  takeovers: number;
  boosts: number;
  revenueCents: number;
  signups: number;
  outboundClicks: number;
  checkoutStarts: number;
}>;

export async function bumpSiteDaily(b: SiteBump, day = dayKey()) {
  await db
    .insert(schema.siteDaily)
    .values({ day, ...b })
    .onConflictDoUpdate({
      target: schema.siteDaily.day,
      set: {
        visits: sql`${schema.siteDaily.visits} + ${b.visits ?? 0}`,
        uniques: sql`${schema.siteDaily.uniques} + ${b.uniques ?? 0}`,
        claims: sql`${schema.siteDaily.claims} + ${b.claims ?? 0}`,
        takeovers: sql`${schema.siteDaily.takeovers} + ${b.takeovers ?? 0}`,
        boosts: sql`${schema.siteDaily.boosts} + ${b.boosts ?? 0}`,
        revenueCents: sql`${schema.siteDaily.revenueCents} + ${b.revenueCents ?? 0}`,
        signups: sql`${schema.siteDaily.signups} + ${b.signups ?? 0}`,
        outboundClicks: sql`${schema.siteDaily.outboundClicks} + ${b.outboundClicks ?? 0}`,
        checkoutStarts: sql`${schema.siteDaily.checkoutStarts} + ${b.checkoutStarts ?? 0}`,
      },
    });
}

export type PlotMetric = "impressions" | "hovers" | "views" | "clicks";

/**
 * Record a metric for a plot. `visitor` lets us count uniques per day.
 * Cheap enough to call on every request; batched upserts keep it to 2 writes.
 */
export async function trackPlot(plotId: number, metric: PlotMetric, visitor: string | null, source?: string) {
  const day = dayKey();
  let isNewUnique = 0;
  if (visitor && (metric === "views" || metric === "impressions")) {
    const r = await db
      .insert(schema.visitorSeen)
      .values({ plotId, day, visitor })
      .onConflictDoNothing()
      .returning({ plotId: schema.visitorSeen.plotId });
    isNewUnique = r.length ? 1 : 0;
  }
  const inc = {
    impressions: metric === "impressions" ? 1 : 0,
    hovers: metric === "hovers" ? 1 : 0,
    views: metric === "views" ? 1 : 0,
    clicks: metric === "clicks" ? 1 : 0,
    uniques: isNewUnique,
  };
  await db
    .insert(schema.plotDaily)
    .values({ plotId, day, ...inc })
    .onConflictDoUpdate({
      target: [schema.plotDaily.plotId, schema.plotDaily.day],
      set: {
        impressions: sql`${schema.plotDaily.impressions} + ${inc.impressions}`,
        hovers: sql`${schema.plotDaily.hovers} + ${inc.hovers}`,
        views: sql`${schema.plotDaily.views} + ${inc.views}`,
        clicks: sql`${schema.plotDaily.clicks} + ${inc.clicks}`,
        uniques: sql`${schema.plotDaily.uniques} + ${inc.uniques}`,
      },
    });
  const totals: Record<string, unknown> = {};
  if (metric === "views") totals.totalViews = sql`${schema.plots.totalViews} + 1`;
  if (metric === "clicks") totals.totalClicks = sql`${schema.plots.totalClicks} + 1`;
  if (metric === "impressions") totals.totalImpressions = sql`${schema.plots.totalImpressions} + 1`;
  if (Object.keys(totals).length) await db.update(schema.plots).set(totals).where(eq(schema.plots.id, plotId));
  if (source && (metric === "views" || metric === "clicks")) {
    await db
      .insert(schema.plotReferrers)
      .values({ plotId, source, views: metric === "views" ? 1 : 0, clicks: metric === "clicks" ? 1 : 0 })
      .onConflictDoUpdate({
        target: [schema.plotReferrers.plotId, schema.plotReferrers.source],
        set: {
          views: sql`${schema.plotReferrers.views} + ${metric === "views" ? 1 : 0}`,
          clicks: sql`${schema.plotReferrers.clicks} + ${metric === "clicks" ? 1 : 0}`,
        },
      });
  }
}

/** Bulk impressions from the skyline (visible buildings reported by the client). */
export async function trackImpressions(plotIds: number[], visitor: string | null) {
  const day = dayKey();
  const ids = Array.from(new Set(plotIds)).slice(0, 400);
  if (!ids.length) return;
  for (const plotId of ids) {
    let isNewUnique = 0;
    if (visitor) {
      const r = await db
        .insert(schema.visitorSeen)
        .values({ plotId, day, visitor })
        .onConflictDoNothing()
        .returning({ plotId: schema.visitorSeen.plotId });
      isNewUnique = r.length ? 1 : 0;
    }
    await db
      .insert(schema.plotDaily)
      .values({ plotId, day, impressions: 1, uniques: isNewUnique })
      .onConflictDoUpdate({
        target: [schema.plotDaily.plotId, schema.plotDaily.day],
        set: {
          impressions: sql`${schema.plotDaily.impressions} + 1`,
          uniques: sql`${schema.plotDaily.uniques} + ${isNewUnique}`,
        },
      });
  }
  await db
    .update(schema.plots)
    .set({ totalImpressions: sql`${schema.plots.totalImpressions} + 1` })
    .where(sql`${schema.plots.id} IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`);
}

export interface DailyRow {
  day: string;
  impressions: number;
  hovers: number;
  views: number;
  clicks: number;
  uniques: number;
  conversions: number;
  conversionValueCents: number;
}

export async function plotSeries(plotId: number, days: number): Promise<DailyRow[]> {
  const since = daysAgoKey(days - 1);
  const rows = await db
    .select()
    .from(schema.plotDaily)
    .where(and(eq(schema.plotDaily.plotId, plotId), gte(schema.plotDaily.day, since)))
    .orderBy(schema.plotDaily.day);
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const out: DailyRow[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = daysAgoKey(i);
    const r = byDay.get(d);
    out.push({
      day: d,
      impressions: r?.impressions ?? 0,
      hovers: r?.hovers ?? 0,
      views: r?.views ?? 0,
      clicks: r?.clicks ?? 0,
      uniques: r?.uniques ?? 0,
      conversions: r?.conversions ?? 0,
      conversionValueCents: r?.conversionValueCents ?? 0,
    });
  }
  return out;
}

export function sumSeries(rows: DailyRow[]) {
  return rows.reduce(
    (a, r) => ({
      impressions: a.impressions + r.impressions,
      hovers: a.hovers + r.hovers,
      views: a.views + r.views,
      clicks: a.clicks + r.clicks,
      uniques: a.uniques + r.uniques,
    }),
    { impressions: 0, hovers: 0, views: 0, clicks: 0, uniques: 0 },
  );
}

export async function plotReferrerRows(plotId: number) {
  return db
    .select()
    .from(schema.plotReferrers)
    .where(eq(schema.plotReferrers.plotId, plotId))
    .orderBy(desc(schema.plotReferrers.clicks), desc(schema.plotReferrers.views))
    .limit(12);
}

/** Views in the last 7 days per plot, for "trending" rankings. */
export async function trendingScores(days = 7): Promise<Map<number, { views: number; clicks: number; impressions: number }>> {
  const since = daysAgoKey(days - 1);
  const rows = await db
    .select({
      plotId: schema.plotDaily.plotId,
      views: sql<number>`sum(${schema.plotDaily.views})`,
      clicks: sql<number>`sum(${schema.plotDaily.clicks})`,
      impressions: sql<number>`sum(${schema.plotDaily.impressions})`,
    })
    .from(schema.plotDaily)
    .where(gte(schema.plotDaily.day, since))
    .groupBy(schema.plotDaily.plotId);
  return new Map(rows.map((r) => [r.plotId, { views: Number(r.views), clicks: Number(r.clicks), impressions: Number(r.impressions) }]));
}

export async function siteSeries(days: number) {
  const since = daysAgoKey(days - 1);
  const rows = await db.select().from(schema.siteDaily).where(gte(schema.siteDaily.day, since)).orderBy(schema.siteDaily.day);
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = daysAgoKey(i);
    out.push(
      byDay.get(d) ?? {
        day: d,
        visits: 0,
        uniques: 0,
        claims: 0,
        takeovers: 0,
        boosts: 0,
        revenueCents: 0,
        signups: 0,
        outboundClicks: 0,
        checkoutStarts: 0,
      },
    );
  }
  return out;
}
