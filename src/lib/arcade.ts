/**
 * Arcade economy. Coins are a soft currency: earned by showing up, exploring
 * and referring; bought for cash; spent to play and to ride; won as prizes.
 * Coins never cash out, but they can be converted into booth value.
 */
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { dayKey, newId, now } from "@/lib/util";
import { addEvent, liveBooth } from "@/lib/economy";
import { publish } from "@/lib/realtime";
import { GAMES, COIN_RULES, type GameId } from "@/lib/rules";
export { GAMES, COIN_RULES, type GameId };
import { allow } from "@/lib/throttle";
import { notify } from "@/lib/notify";
import { bumpQuest } from "@/lib/quest-progress";



export async function addCoins(userId: string, delta: number, reason: string, ref?: string): Promise<number> {
  await ensureMigrated();
  const [u] = await db
    .update(schema.users)
    .set({ coins: sql`greatest(0, ${schema.users.coins} + ${delta})` })
    .where(eq(schema.users.id, userId))
    .returning({ coins: schema.users.coins });
  await db.insert(schema.coinLedger).values({ id: newId(), userId, delta, reason, ref: ref ?? null, createdAt: now() });
  return u?.coins ?? 0;
}

/** Take coins only if the balance covers them, in one statement. Null when it doesn't, so two racing spends can't both pass. */
export async function spendCoins(userId: string, amount: number, reason: string, ref?: string): Promise<number | null> {
  await ensureMigrated();
  const [u] = await db.update(schema.users).set({ coins: sql`${schema.users.coins} - ${amount}` })
    .where(and(eq(schema.users.id, userId), sql`${schema.users.coins} >= ${amount}`)).returning({ coins: schema.users.coins });
  if (!u) return null;
  await db.insert(schema.coinLedger).values({ id: newId(), userId, delta: -amount, reason, ref: ref ?? null, createdAt: now() });
  return u.coins;
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
  // only the request that still sees the old check-in time pays out: two tabs at once can't both collect
  const won = await db.update(schema.users).set({ lastDailyCoinsAt: now(), streak })
    .where(and(eq(schema.users.id, userId), sql`${schema.users.lastDailyCoinsAt} IS NOT DISTINCT FROM ${u.lastDailyCoinsAt ?? null}`)).returning({ id: schema.users.id });
  if (!won.length) return { awarded: 0, streak: u.streak, coins: u.coins };
  const coins = await addCoins(userId, awarded, "daily", `streak:${streak}`);
  return { awarded, streak, coins };
}

export async function exploreReward(userId: string, boothId: number): Promise<number> {
  // decided before any await, so a burst of parallel views can't all pass the daily checks below
  if (!allow(`explore:${userId}`, 10, 86_400_000) || !allow(`explore:${userId}:${boothId}`, 1, 86_400_000)) return 0;
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
  const coins = await spendCoins(userId, g.cost, "play", gameId);
  if (coins === null) throw new Error(`You need ${g.cost} coins to play. Come back tomorrow for your daily coins, or grab a pack.`);
  // one game at a time: starting a new one closes any other open game, so a script can't run dozens at once and
  // claim a prize on each
  await db.update(schema.gamePlays).set({ finishedAt: now() }).where(and(eq(schema.gamePlays.userId, userId), isNull(schema.gamePlays.finishedAt)));
  const playId = newId();
  await db.insert(schema.gamePlays).values({ id: playId, gameId, userId, startedAt: now() });
  return { playId, coins };
}

export async function finishPlay(userId: string, playId: string, score: number, playerName: string, boothId: number | null) {
  await ensureMigrated();
  // close the play in one statement: two submissions of one play can't both score or both win the prize
  const [p] = await db.update(schema.gamePlays).set({ finishedAt: now() })
    .where(and(eq(schema.gamePlays.id, playId), eq(schema.gamePlays.userId, userId), isNull(schema.gamePlays.finishedAt))).returning();
  if (!p) throw new Error("Unknown or already scored play");
  const g = GAMES[p.gameId as GameId];
  const elapsed = now() - p.startedAt;
  // Sanity: scores accrue over time. Reject the impossible.
  const caps: Record<string, number> = { runner: 60, breakout: 120, snake: 40, swarm: 260, rocks: 150, paddle: 80, stack: 120, flap: 30, cross: 70, whack: 60, match: 200 };
  const maxPerSecond = caps[p.gameId] ?? 40;
  // fixed-length games have a real minimum and maximum; everything else expires after an hour
  const LIMITS: Record<string, { minS?: number; maxS: number; maxScore?: number }> = { whack: { minS: 44, maxS: 90 }, match: { maxS: 90, maxScore: 1400 } };
  const lim = LIMITS[p.gameId] ?? { maxS: 3600 };
  if (elapsed > lim.maxS * 1000 + 60_000) throw new Error("That game timed out. Start a new one.");
  const cap = Math.floor((elapsed / 1000 + 2) * maxPerSecond);
  const impossible = !Number.isFinite(score) || score > cap || (lim.minS !== undefined && elapsed < lim.minS * 1000) || (lim.maxScore !== undefined && score > lim.maxScore);
  // an impossible score is thrown out, not trimmed down to the most a fast player could have reached
  const s = impossible ? 0 : Math.max(0, Math.floor(score));
  await db.insert(schema.gameScores).values({ id: newId(), gameId: p.gameId, userId, playerName, boothId, score: s, day: dayKey(), createdAt: now() });
  await bumpQuest(userId, "arcade", 1, 1); // the daily "play a round" quest counts a finished round, whatever the score
  let prize = 0;
  // prizes pay a few times per game per day, however many winning scores come in
  const [won] = s >= g.prizeAt ? await db.select({ n: sql<number>`count(*)` }).from(schema.coinLedger)
    .where(and(eq(schema.coinLedger.userId, userId), eq(schema.coinLedger.reason, "prize"), sql`${schema.coinLedger.ref} ILIKE ${`${p.gameId}:%`}`, gte(schema.coinLedger.createdAt, now() - 86_400_000))) : [{ n: 0 }];
  if (s >= g.prizeAt && Number(won?.n ?? 0) < 3) {
    prize = g.prize;
    await addCoins(userId, prize, "prize", `${p.gameId}:${s}`);
    await notify(userId, "prize", `You won ${prize} coins on ${g.name}`, `${s.toLocaleString()} points. Coins convert into booth value from the dashboard.`);
  }
  // Beat the daily #1? Announce it, and tell whoever just lost the top spot.
  const [prevTop] = await db.select({ userId: schema.gameScores.userId, score: schema.gameScores.score, name: schema.gameScores.playerName }).from(schema.gameScores)
    .where(and(eq(schema.gameScores.gameId, p.gameId), eq(schema.gameScores.day, dayKey()), sql`${schema.gameScores.userId} != ${userId}`)).orderBy(desc(schema.gameScores.score)).limit(1);
  const [top] = await db
    .select({ score: schema.gameScores.score })
    .from(schema.gameScores)
    .where(and(eq(schema.gameScores.gameId, p.gameId), eq(schema.gameScores.day, dayKey())))
    .orderBy(desc(schema.gameScores.score))
    .limit(1);
  if (top && top.score === s) {
    await addEvent("arcade", boothId, `${playerName} tops ${g.name} today`, `${s.toLocaleString()} points`, null);
    if (prevTop && prevTop.score < s) await notify(prevTop.userId, "arcade", `${playerName} beat your ${g.name} score`, `${s.toLocaleString()} points against your ${prevTop.score.toLocaleString()}. Back to the arcade?`);
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
      playerName: sql<string>`max(${schema.gameScores.playerName})`, // one row per player: the name and booth as aggregates, as Postgres requires
      boothId: sql<number | null>`max(${schema.gameScores.boothId})`,
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
  const coins = await spendCoins(userId, COIN_RULES.flyoverCost, "flyover");
  if (coins === null) throw new Error(`The Hall Flyover costs ${COIN_RULES.flyoverCost} coins.`);
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
  if ((await spendCoins(userId, spend, "boost_convert", `booth:${boothId}`)) === null) throw new Error("Not enough coins");
  const [np] = await db
    .update(schema.booths)
    // coins are mostly given away (daily visits, prizes): value made from them never pays out in a takeover
    .set({ valueCents: sql`${schema.booths.valueCents} + ${cents}`, freeValueCents: sql`${schema.booths.freeValueCents} + ${cents}`, updatedAt: now() })
    .where(eq(schema.booths.id, boothId))
    .returning();
  await addEvent("boost", boothId, `${np.name} grew taller with arcade coins`, `+$${(cents / 100).toFixed(0)} in value`, cents);
  publish({ type: "booth", booth: liveBooth(np) });
  return { spent: spend, cents, valueCents: np.valueCents };
}
