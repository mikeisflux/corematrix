/**
 * Weekly seasons. Monday 00:00 UTC a season closes: we snapshot the week's
 * trending leaderboard, pay coin prizes, feature the top 3 on the home page
 * for the next week, and store everyone's rank so the dashboard can show
 * "you moved from #19 to #12". Closing is lazy (any request after the
 * boundary triggers it) and also run by the daily cron, so it works without
 * a scheduler too.
 */
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { dayKey, newId, now, weekBounds, weekId } from "@/lib/util";
import { addCoins } from "@/lib/arcade";
import { addEvent } from "@/lib/economy";
import { sendMail } from "@/lib/mailer";
import { SITE_NAME, SITE_URL } from "@/lib/config";

export const SEASON_PRIZES = [300, 150, 75] as const;
export const FEATURED_DAYS = 7;

export interface SeasonRow {
  plotId: number;
  name: string;
  ownerId: string | null;
  views: number;
  clicks: number;
  impressions: number;
  valueCents: number;
}
export interface SeasonResults {
  trending: SeasonRow[]; // top 10 by views that week
  clicks: SeasonRow[]; // top 10 by clicks
  valueRanks: Record<number, number>; // plotId -> rank by value at close
  totals: { views: number; clicks: number; claims: number };
}

const g = globalThis as unknown as { __seasonCheck?: number };

/** Closes any season whose week has ended and has no results yet. Cheap when nothing to do. */
export async function ensureSeasons(): Promise<void> {
  await ensureMigrated();
  const t = now();
  if (g.__seasonCheck && t - g.__seasonCheck < 60_000) return;
  g.__seasonCheck = t;
  const prevWeekStart = weekBounds(t).startsAt - 7 * 86_400_000;
  const prevId = weekId(prevWeekStart);
  const [row] = await db.select().from(schema.seasons).where(eq(schema.seasons.id, prevId));
  if (row?.closedAt) return;
  await closeSeason(prevWeekStart);
}

export async function closeSeason(weekStartTs: number): Promise<SeasonResults> {
  const { startsAt, endsAt } = weekBounds(weekStartTs);
  const id = weekId(startsAt);
  const since = dayKey(startsAt);
  const until = dayKey(endsAt);
  const agg = await db
    .select({
      plotId: schema.plotDaily.plotId,
      views: sql<number>`sum(${schema.plotDaily.views})`,
      clicks: sql<number>`sum(${schema.plotDaily.clicks})`,
      impressions: sql<number>`sum(${schema.plotDaily.impressions})`,
    })
    .from(schema.plotDaily)
    .where(and(gte(schema.plotDaily.day, since), lt(schema.plotDaily.day, until)))
    .groupBy(schema.plotDaily.plotId);
  const plots = await db.select({ id: schema.plots.id, name: schema.plots.name, ownerId: schema.plots.ownerId, valueCents: schema.plots.valueCents }).from(schema.plots).where(sql`owner_id IS NOT NULL`);
  const byId = new Map(plots.map((p) => [p.id, p]));
  const rows: SeasonRow[] = agg
    .filter((a) => byId.has(a.plotId))
    .map((a) => ({ plotId: a.plotId, name: byId.get(a.plotId)!.name ?? `Plot #${a.plotId}`, ownerId: byId.get(a.plotId)!.ownerId, views: Number(a.views), clicks: Number(a.clicks), impressions: Number(a.impressions), valueCents: byId.get(a.plotId)!.valueCents }));
  const trending = rows.slice().sort((a, b) => b.views - a.views).slice(0, 10);
  const clicks = rows.slice().sort((a, b) => b.clicks - a.clicks).slice(0, 10);
  const valueRanks: Record<number, number> = {};
  plots.slice().sort((a, b) => b.valueCents - a.valueCents).forEach((p, i) => (valueRanks[p.id] = i + 1));
  const [claims] = await db.select({ n: sql<number>`sum(claims + takeovers)` }).from(schema.siteDaily).where(and(gte(schema.siteDaily.day, since), lt(schema.siteDaily.day, until)));
  const results: SeasonResults = { trending, clicks, valueRanks, totals: { views: rows.reduce((a, r) => a + r.views, 0), clicks: rows.reduce((a, r) => a + r.clicks, 0), claims: Number(claims?.n ?? 0) } };

  // Insert-or-mark-closed atomically so two requests can't both pay prizes.
  const inserted = await db
    .insert(schema.seasons)
    .values({ id, startsAt, endsAt, closedAt: now(), resultsJson: JSON.stringify(results) })
    .onConflictDoNothing()
    .returning({ id: schema.seasons.id });
  if (!inserted.length) {
    const upd = await db
      .update(schema.seasons)
      .set({ closedAt: now(), resultsJson: JSON.stringify(results) })
      .where(and(eq(schema.seasons.id, id), sql`${schema.seasons.closedAt} IS NULL`))
      .returning({ id: schema.seasons.id });
    if (!upd.length) return results;
  }

  // Prizes, featured placement, notifications, feed.
  const featuredUntil = now() + FEATURED_DAYS * 86_400_000;
  for (let i = 0; i < Math.min(3, trending.length); i++) {
    const w = trending[i];
    if (w.views === 0) break;
    await db.update(schema.plots).set({ featuredUntil }).where(eq(schema.plots.id, w.plotId));
    if (w.ownerId) {
      await addCoins(w.ownerId, SEASON_PRIZES[i], "prize", `season:${id}:${i + 1}`);
      await db.insert(schema.notifications).values({
        id: newId(),
        userId: w.ownerId,
        type: "season",
        title: `${w.name} finished #${i + 1} this week`,
        body: `${w.views.toLocaleString()} views and ${w.clicks.toLocaleString()} clicks in season ${id}. You won ${SEASON_PRIZES[i]} coins and a week on the home page.`,
        plotId: w.plotId,
        createdAt: now(),
      });
      const [owner] = await db.select({ email: schema.users.email, notify: schema.users.notifyEmail }).from(schema.users).where(eq(schema.users.id, w.ownerId));
      if (owner?.notify) {
        await sendMail(
          owner.email,
          `${w.name} finished #${i + 1} on ${SITE_NAME} this week`,
          `<p><b>${w.name}</b> was the #${i + 1} trending building in season ${id}: ${w.views.toLocaleString()} views, ${w.clicks.toLocaleString()} clicks.</p><p>You won <b>${SEASON_PRIZES[i]} coins</b> and your building is featured on the home page for the next 7 days.</p><p><a href="${SITE_URL}/dashboard?plot=${w.plotId}">Open your dashboard</a></p>`,
        );
      }
    }
  }
  if (trending[0]?.views) {
    await addEvent("season", trending[0].plotId, `Season ${id}: ${trending[0].name} takes #1`, `${trending[0].views.toLocaleString()} views this week · top 3 are featured all week`, null);
  }
  return results;
}

export async function lastSeason(): Promise<{ id: string; results: SeasonResults } | null> {
  await ensureSeasons();
  const [row] = await db.select().from(schema.seasons).where(sql`${schema.seasons.closedAt} IS NOT NULL`).orderBy(desc(schema.seasons.startsAt)).limit(1);
  if (!row?.resultsJson) return null;
  return { id: row.id, results: JSON.parse(row.resultsJson) as SeasonResults };
}

export async function seasonHistory(limit = 12) {
  await ensureSeasons();
  const rows = await db.select().from(schema.seasons).where(sql`${schema.seasons.closedAt} IS NOT NULL`).orderBy(desc(schema.seasons.startsAt)).limit(limit);
  return rows.map((r) => ({ id: r.id, startsAt: r.startsAt, endsAt: r.endsAt, results: JSON.parse(r.resultsJson ?? "{}") as SeasonResults }));
}

/** Plots to show in the home-page featured strip: season winners first, then Landmarks. */
export async function featuredPlots(limit = 6) {
  await ensureSeasons();
  const t = now();
  const winners = await db.select().from(schema.plots).where(and(sql`${schema.plots.featuredUntil} > ${t}`, eq(schema.plots.hidden, false))).orderBy(desc(schema.plots.totalViews)).limit(3);
  const landmarks = await db.select().from(schema.plots).where(and(eq(schema.plots.tier, "landmark"), eq(schema.plots.hidden, false), sql`${schema.plots.tierUntil} > ${t}`)).orderBy(desc(schema.plots.valueCents)).limit(limit);
  const seen = new Set<number>();
  const out: Array<{ id: number; name: string | null; tagline: string | null; reason: "winner" | "landmark"; valueCents: number }> = [];
  for (const w of winners) if (!seen.has(w.id)) { seen.add(w.id); out.push({ id: w.id, name: w.name, tagline: w.tagline, reason: "winner", valueCents: w.valueCents }); }
  for (const l of landmarks) if (!seen.has(l.id) && out.length < limit) { seen.add(l.id); out.push({ id: l.id, name: l.name, tagline: l.tagline, reason: "landmark", valueCents: l.valueCents }); }
  return out;
}

/** Rank by value last week (from the season snapshot), for "moved from #19 to #12". */
export async function lastWeekRank(plotId: number): Promise<number | null> {
  const s = await lastSeason();
  return s?.results.valueRanks[plotId] ?? null;
}
