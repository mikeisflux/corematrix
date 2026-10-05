/**
 * Arcade economy. Coins are a soft currency: earned by showing up, exploring
 * and referring; bought for cash; spent to play and to ride; won as prizes.
 * Coins never cash out, but they can be converted into booth value.
 */
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { dayKey, newId, now } from "@/lib/util";
import { addEvent, liveBooth } from "@/lib/economy";
import { publish } from "@/lib/realtime";

export const GAMES = {
  snake: { name: "Serpent Ave.", blurb: "Classic snake. Eat, grow, don't crash.", cost: 2, prizeAt: 400, prize: 25 },
  breakout: { name: "Block Party", blurb: "Smash the longboxes brick by brick.", cost: 2, prizeAt: 800, prize: 30 },
  runner: { name: "Rooftop Run", blurb: "Jump the gaps. One button. Endless.", cost: 3, prizeAt: 1500, prize: 40 },
} as const;
export type GameId = keyof typeof GAMES;

export const COIN_RULES = {
  dailyVisit: 5,
  streakBonusPerDay: 1, // up to +10
  explore: 1, // first view of a booth each day (max 10/day)
  claim: 50,
  referral: 25,
  flyoverCost: 5,
  convertRate: 100, // coins per $1 of booth value when converting
  packs: [
    { id: "pack_small", coins: 100, priceCents: 199 },
    { id: "pack_med", coins: 350, priceCents: 499 },
    { id: "pack_big", coins: 1000, priceCents: 999 },
  ],
} as const;

export async function addCoins(userId: string, delta: number, reason: string, ref?: string): Promise<number> {
  await ensureMigrated();
  const [u] = await db
    .update(schema.users)
    .set({ coins: sql`max(0, ${schema.users.coins} + ${delta})` })
    .where(eq(schema.users.id, userId))
    .returning({ coins: schema.users.coins });
  await db.insert(schema.coinLedger).values({ id: newId(), userId, delta, reason, ref: ref ?? null, createdAt: now() });
  return u?.coins ?? 0;
}

/** Daily check-in with streak. Returns coins awarded (0 if already claimed today). */
export async function dailyCheckIn(userId: string): Promise<{ awarded: number; streak: number; coins: number }> {
  await ensureMigrated();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!u) return { awarded: 0, streak: 0, coins: 0 };
  const today = dayKey();
  const last = u.lastDailyCoinsAt ? dayKey(u.lastDailyCoinsAt) : null;
  if (last === today) return { awarded: 0, streak: u.streak, coins: u.coins };
  const yesterday = dayKey(now() - 86_400_000);
  const streak = last === yesterday ? u.streak + 1 : 1;
  const awarded = COIN_RULES.dailyVisit + Math.min(10, (streak - 1) * COIN_RULES.streakBonusPerDay);
  await db.update(schema.users).set({ lastDailyCoinsAt: now(), streak }).where(eq(schema.users.id, userId));
  const coins = await addCoins(userId, awarded, "daily", `streak:${streak}`);
  return { awarded, streak, coins };
}

export async function exploreReward(userId: string, boothId: number): Promise<number> {
  const since = now() - 86_400_000;
  const [c] = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.coinLedger)
    .where(and(eq(schema.coinLedger.userId, userId), eq(schema.coinLedger.reason, "explore"), gte(schema.coinLedger.createdAt, since)));
  if (Number(c?.n ?? 0) >= 10) return 0;
  const [dup] = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.coinLedger)
    .where(and(eq(schema.coinLedger.userId, userId), eq(schema.coinLedger.reason, "explore"), eq(schema.coinLedger.ref, `booth:${boothId}`), gte(schema.coinLedger.createdAt, since)));
  if (Number(dup?.n ?? 0) > 0) return 0;
  await addCoins(userId, COIN_RULES.explore, "explore", `booth:${boothId}`);
  return COIN_RULES.explore;
}

export async function startPlay(userId: string, gameId: GameId): Promise<{ playId: string; coins: number }> {
  await ensureMigrated();
  const g = GAMES[gameId];
  const [u] = await db.select({ coins: schema.users.coins }).from(schema.users).where(eq(schema.users.id, userId));
  if (!u || u.coins < g.cost) throw new Error(`You need ${g.cost} coins to play. Come back tomorrow for your daily coins, or grab a pack.`);
  const coins = await addCoins(userId, -g.cost, "play", gameId);
  const playId = newId();
  await db.insert(schema.gamePlays).values({ id: playId, gameId, userId, startedAt: now() });
  return { playId, coins };
}

export async function finishPlay(userId: string, playId: string, score: number, playerName: string, boothId: number | null) {
  await ensureMigrated();
  const [p] = await db.select().from(schema.gamePlays).where(eq(schema.gamePlays.id, playId));
  if (!p || p.userId !== userId) throw new Error("Unknown play");
  if (p.finishedAt) throw new Error("Already scored");
  const g = GAMES[p.gameId as GameId];
  const elapsed = now() - p.startedAt;
  // Sanity: scores accrue over time. Reject the impossible.
  const maxPerSecond = p.gameId === "runner" ? 60 : p.gameId === "breakout" ? 120 : 40;
  const s = Math.max(0, Math.min(Math.floor(score), Math.floor((elapsed / 1000 + 2) * maxPerSecond)));
  await db.update(schema.gamePlays).set({ finishedAt: now() }).where(eq(schema.gamePlays.id, playId));
  await db.insert(schema.gameScores).values({ id: newId(), gameId: p.gameId, userId, playerName, boothId, score: s, day: dayKey(), createdAt: now() });
  let prize = 0;
  if (s >= g.prizeAt) {
    prize = g.prize;
    await addCoins(userId, prize, "prize", `${p.gameId}:${s}`);
  }
  // Beat the daily #1? Announce it.
  const [top] = await db
    .select({ score: schema.gameScores.score })
    .from(schema.gameScores)
    .where(and(eq(schema.gameScores.gameId, p.gameId), eq(schema.gameScores.day, dayKey())))
    .orderBy(desc(schema.gameScores.score))
    .limit(1);
  if (top && top.score === s) {
    await addEvent("arcade", boothId, `${playerName} tops ${g.name} today`, `${s.toLocaleString()} points`, null);
  }
  const [u] = await db.select({ coins: schema.users.coins }).from(schema.users).where(eq(schema.users.id, userId));
  return { score: s, prize, coins: u?.coins ?? 0 };
}

export async function leaderboard(gameId: GameId, scope: "today" | "all", limit = 20) {
  await ensureMigrated();
  const where = scope === "today" ? and(eq(schema.gameScores.gameId, gameId), eq(schema.gameScores.day, dayKey())) : eq(schema.gameScores.gameId, gameId);
  const rows = await db
    .select({
      userId: schema.gameScores.userId,
      playerName: schema.gameScores.playerName,
      boothId: schema.gameScores.boothId,
      score: sql<number>`max(${schema.gameScores.score})`,
      at: sql<number>`max(${schema.gameScores.createdAt})`,
    })
    .from(schema.gameScores)
    .where(where)
    .groupBy(schema.gameScores.userId)
    .orderBy(desc(sql`max(${schema.gameScores.score})`))
    .limit(limit);
  return rows.map((r, i) => ({ rank: i + 1, ...r, score: Number(r.score) }));
}

export async function myBest(gameId: GameId, userId: string) {
  const [r] = await db
    .select({ best: sql<number>`max(${schema.gameScores.score})`, plays: sql<number>`count(*)` })
    .from(schema.gameScores)
    .where(and(eq(schema.gameScores.gameId, gameId), eq(schema.gameScores.userId, userId)));
  return { best: Number(r?.best ?? 0), plays: Number(r?.plays ?? 0) };
}

export async function rideFlyover(userId: string): Promise<number> {
  const [u] = await db.select({ coins: schema.users.coins }).from(schema.users).where(eq(schema.users.id, userId));
  if (!u || u.coins < COIN_RULES.flyoverCost) throw new Error(`The Hall Flyover costs ${COIN_RULES.flyoverCost} coins.`);
  const coins = await addCoins(userId, -COIN_RULES.flyoverCost, "flyover");
  publish({ type: "presence", online: -1 }); // no-op marker; presence recomputed by bus
  return coins;
}

/** Turn coins into booth value: 100 coins = $1. A coin sink that feeds the status game. */
export async function convertCoinsToValue(userId: string, boothId: number, coins: number) {
  await ensureMigrated();
  if (!Number.isFinite(coins) || coins < COIN_RULES.convertRate) throw new Error(`Minimum ${COIN_RULES.convertRate} coins`);
  const [p] = await db.select().from(schema.booths).where(eq(schema.booths.id, boothId));
  if (!p || p.ownerId !== userId) throw new Error("Not your booth");
  const [u] = await db.select({ coins: schema.users.coins }).from(schema.users).where(eq(schema.users.id, userId));
  const spend = Math.min(Math.floor(coins / COIN_RULES.convertRate) * COIN_RULES.convertRate, u?.coins ?? 0);
  if (spend < COIN_RULES.convertRate) throw new Error("Not enough coins");
  const cents = (spend / COIN_RULES.convertRate) * 100;
  await addCoins(userId, -spend, "boost_convert", `booth:${boothId}`);
  const [np] = await db
    .update(schema.booths)
    .set({ valueCents: sql`${schema.booths.valueCents} + ${cents}`, updatedAt: now() })
    .where(eq(schema.booths.id, boothId))
    .returning();
  await addEvent("boost", boothId, `${np.name} grew taller with arcade coins`, `+$${(cents / 100).toFixed(0)} in value`, cents);
  publish({ type: "booth", booth: liveBooth(np) });
  return { spent: spend, cents, valueCents: np.valueCents };
}
