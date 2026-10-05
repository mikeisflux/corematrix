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

export type BoothMetric = "impressions" | "hovers" | "views" | "clicks";

/**
 * Record a metric for a booth. `visitor` lets us count uniques per day.
 * Cheap enough to call on every request; batched upserts keep it to 2 writes.
 */
export async function trackBooth(boothId: number, metric: BoothMetric, visitor: string | null, source?: string) {
  const day = dayKey();
  let isNewUnique = 0;
  if (visitor && (metric === "views" || metric === "impressions")) {
    const r = await db
      .insert(schema.visitorSeen)
      .values({ boothId, day, visitor })
      .onConflictDoNothing()
      .returning({ boothId: schema.visitorSeen.boothId });
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
    .insert(schema.boothDaily)
    .values({ boothId, day, ...inc })
    .onConflictDoUpdate({
      target: [schema.boothDaily.boothId, schema.boothDaily.day],
      set: {
        impressions: sql`${schema.boothDaily.impressions} + ${inc.impressions}`,
        hovers: sql`${schema.boothDaily.hovers} + ${inc.hovers}`,
        views: sql`${schema.boothDaily.views} + ${inc.views}`,
        clicks: sql`${schema.boothDaily.clicks} + ${inc.clicks}`,
        uniques: sql`${schema.boothDaily.uniques} + ${inc.uniques}`,
      },
    });
  const totals: Record<string, unknown> = {};
  if (metric === "views") totals.totalViews = sql`${schema.booths.totalViews} + 1`;
  if (metric === "clicks") totals.totalClicks = sql`${schema.booths.totalClicks} + 1`;
  if (metric === "impressions") totals.totalImpressions = sql`${schema.booths.totalImpressions} + 1`;
  if (Object.keys(totals).length) await db.update(schema.booths).set(totals).where(eq(schema.booths.id, boothId));
  if (source && (metric === "views" || metric === "clicks")) {
    await db
      .insert(schema.boothReferrers)
      .values({ boothId, source, views: metric === "views" ? 1 : 0, clicks: metric === "clicks" ? 1 : 0 })
      .onConflictDoUpdate({
        target: [schema.boothReferrers.boothId, schema.boothReferrers.source],
        set: {
          views: sql`${schema.boothReferrers.views} + ${metric === "views" ? 1 : 0}`,
          clicks: sql`${schema.boothReferrers.clicks} + ${metric === "clicks" ? 1 : 0}`,
        },
      });
  }
}

/** Bulk impressions from the floor (visible booths reported by the client). */
export async function trackImpressions(boothIds: number[], visitor: string | null) {
  const day = dayKey();
  const ids = Array.from(new Set(boothIds)).slice(0, 400);
  if (!ids.length) return;
  for (const boothId of ids) {
    let isNewUnique = 0;
    if (visitor) {
      const r = await db
        .insert(schema.visitorSeen)
        .values({ boothId, day, visitor })
        .onConflictDoNothing()
        .returning({ boothId: schema.visitorSeen.boothId });
      isNewUnique = r.length ? 1 : 0;
    }
    await db
      .insert(schema.boothDaily)
      .values({ boothId, day, impressions: 1, uniques: isNewUnique })
      .onConflictDoUpdate({
        target: [schema.boothDaily.boothId, schema.boothDaily.day],
        set: {
          impressions: sql`${schema.boothDaily.impressions} + 1`,
          uniques: sql`${schema.boothDaily.uniques} + ${isNewUnique}`,
        },
      });
  }
  await db
    .update(schema.booths)
    .set({ totalImpressions: sql`${schema.booths.totalImpressions} + 1` })
    .where(sql`${schema.booths.id} IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`);
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

export async function boothSeries(boothId: number, days: number): Promise<DailyRow[]> {
  const since = daysAgoKey(days - 1);
  const rows = await db
    .select()
    .from(schema.boothDaily)
    .where(and(eq(schema.boothDaily.boothId, boothId), gte(schema.boothDaily.day, since)))
    .orderBy(schema.boothDaily.day);
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

export async function boothReferrerRows(boothId: number) {
  return db
    .select()
    .from(schema.boothReferrers)
    .where(eq(schema.boothReferrers.boothId, boothId))
    .orderBy(desc(schema.boothReferrers.clicks), desc(schema.boothReferrers.views))
    .limit(12);
}

/** Views in the last 7 days per booth, for "trending" rankings. */
export async function trendingScores(days = 7): Promise<Map<number, { views: number; clicks: number; impressions: number }>> {
  const since = daysAgoKey(days - 1);
  const rows = await db
    .select({
      boothId: schema.boothDaily.boothId,
      views: sql<number>`sum(${schema.boothDaily.views})`,
      clicks: sql<number>`sum(${schema.boothDaily.clicks})`,
      impressions: sql<number>`sum(${schema.boothDaily.impressions})`,
    })
    .from(schema.boothDaily)
    .where(gte(schema.boothDaily.day, since))
    .groupBy(schema.boothDaily.boothId);
  return new Map(rows.map((r) => [r.boothId, { views: Number(r.views), clicks: Number(r.clicks), impressions: Number(r.impressions) }]));
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
