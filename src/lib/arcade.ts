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
import { REFERRAL_COINS } from "@/lib/config";
import { allow } from "@/lib/throttle";
import { notify } from "@/lib/notify";

export const GAMES = {
  snake: { name: "Serpent Ave.", blurb: "Classic snake. Eat, grow, don't crash.", cost: 2, prizeAt: 400, prize: 25 },
  breakout: { name: "Block Party", blurb: "Smash the longboxes brick by brick.", cost: 2, prizeAt: 800, prize: 30 },
  runner: { name: "Rooftop Run", blurb: "Jump the gaps. One button. Endless.", cost: 3, prizeAt: 1500, prize: 40 },
  swarm: { name: "Star Swarm", blurb: "The classic formation shooter. They dive, you don't blink.", cost: 3, prizeAt: 5000, prize: 60 },
  rocks: { name: "Rock Field", blurb: "Thrust, turn, shoot. Big rocks make little rocks.", cost: 3, prizeAt: 3000, prize: 45 },
  paddle: { name: "Paddle Duel", blurb: "Pong against the house. It gets mean.", cost: 2, prizeAt: 800, prize: 30 },
  stack: { name: "Longbox Stack", blurb: "Falling blocks. Clear lines, don't top out.", cost: 3, prizeAt: 2500, prize: 45 },
  flap: { name: "Cape Flap", blurb: "One button. Through the gaps. Keep the cape on.", cost: 2, prizeAt: 300, prize: 30 },
  cross: { name: "Aisle Crosser", blurb: "Hop across the hand carts to the far side of the hall.", cost: 2, prizeAt: 1000, prize: 35 },
  whack: { name: "Whack-a-Villain", blurb: "45 seconds. Purple villains, teal fans. Don't whack the fans.", cost: 1, prizeAt: 400, prize: 20 },
  match: { name: "Cover Match", blurb: "Eight pairs, sixty seconds, a good memory.", cost: 1, prizeAt: 1100, prize: 25 },
} as const;
export type GameId = keyof typeof GAMES;

export const COIN_RULES = {
  dailyVisit: 5,
  streakBonusPerDay: 1, // up to +10
  explore: 1, // first view of a booth each day (max 10/day)
  claim: 50,
  referral: REFERRAL_COINS,
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
    .where(and(eq(schema.users.id, userId), sql`${schema.users.lastDailyCoinsAt} IS ${u.lastDailyCoinsAt ?? null}`)).returning({ id: schema.users.id });
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
  let prize = 0;
  // prizes pay a few times per game per day, however many winning scores come in
  const [won] = s >= g.prizeAt ? await db.select({ n: sql<number>`count(*)` }).from(schema.coinLedger)
    .where(and(eq(schema.coinLedger.userId, userId), eq(schema.coinLedger.reason, "prize"), sql`${schema.coinLedger.ref} LIKE ${`${p.gameId}:%`}`, gte(schema.coinLedger.createdAt, now() - 86_400_000))) : [{ n: 0 }];
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
