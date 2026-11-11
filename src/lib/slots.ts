/**
 * The casino corner of the arcade: a three-reel slot machine that bets coins. The reels are drawn on the server (the
 * client only animates the result), each reel an independent weighted draw from the same strip, so the odds below are
 * exact and the pay table is public. Bets and wins go through the coin ledger like every other coin movement.
 */
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { newId, now } from "@/lib/util";
import { addCoins, spendCoins } from "@/lib/arcade";
import { allow } from "@/lib/throttle";

export { SLOT_SYMBOLS, SLOT_BETS, SLOT_PAIRS, SLOT_RTP, payout, type SlotSymbol } from "@/lib/slots-table";
import { SLOT_BETS, STRIP, payout, type SlotSymbol } from "@/lib/slots-table";

function draw(): SlotSymbol { return STRIP[Math.floor(Math.random() * STRIP.length)]; }

export interface SpinResult { reels: SlotSymbol[]; mult: number; line: string | null; win: number; coins: number }

export async function spin(userId: string, bet: number): Promise<SpinResult> {
  await ensureMigrated();
  if (!(SLOT_BETS as readonly number[]).includes(bet)) throw new Error("Pick a bet from the table");
  if (!allow(`slots:${userId}`, 3, 2000)) throw new Error("The reels are still turning");
  const spinId = newId();
  const after = await spendCoins(userId, bet, "slots", spinId);
  if (after === null) throw new Error(`You need ${bet} coins for that bet. Lower the bet, or grab a pack.`);
  const reels = [draw(), draw(), draw()];
  const { mult, line } = payout(reels);
  const win = mult * bet;
  const coins = win > 0 ? await addCoins(userId, win, "slots_win", `${spinId}:${reels.join(",")}`) : after;
  return { reels, mult, line, win, coins };
}

/** Today's biggest single wins and the player's own totals. */
export async function slotsBoard(userId: string | null) {
  await ensureMigrated();
  const since = now() - 86_400_000;
  const rows = await db.select({ userId: schema.coinLedger.userId, name: schema.users.displayName, win: schema.coinLedger.delta, at: schema.coinLedger.createdAt })
    .from(schema.coinLedger).innerJoin(schema.users, eq(schema.users.id, schema.coinLedger.userId))
    .where(and(eq(schema.coinLedger.reason, "slots_win"), gte(schema.coinLedger.createdAt, since)))
    .orderBy(desc(schema.coinLedger.delta)).limit(10);
  let mine: { spins: number; bet: number; won: number } | null = null;
  if (userId) {
    const [b] = await db.select({ n: sql<number>`count(*)`, sum: sql<number>`coalesce(sum(${schema.coinLedger.delta}), 0)` }).from(schema.coinLedger).where(and(eq(schema.coinLedger.userId, userId), eq(schema.coinLedger.reason, "slots")));
    const [w] = await db.select({ sum: sql<number>`coalesce(sum(${schema.coinLedger.delta}), 0)` }).from(schema.coinLedger).where(and(eq(schema.coinLedger.userId, userId), eq(schema.coinLedger.reason, "slots_win")));
    mine = { spins: Number(b?.n ?? 0), bet: -Number(b?.sum ?? 0), won: Number(w?.sum ?? 0) };
  }
  return { rows: rows.map((r) => ({ ...r, name: r.name ?? "player", win: Number(r.win), at: Number(r.at) })), mine };
}
