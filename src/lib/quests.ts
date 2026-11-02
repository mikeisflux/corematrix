/**
 * Daily quests: three small things to do on the floor each day, each paying coins, with a bonus for all three.
 * Coins convert into booth value, which is what the weekly rankings count, so a regular visitor's quests feed the
 * booth they back. Days are UTC, like the daily check-in.
 */
import { and, eq, gte, isNull } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { dayKey, now } from "@/lib/util";
import { addCoins } from "@/lib/arcade";
import { bumpQuest, type QuestId } from "@/lib/quest-progress";

import { QUESTS, BONUS_COINS } from "@/lib/rules";
export { QUESTS, BONUS_COINS };
export const THEATER_REPORT_CAP = 40; // seconds one report may add (the client reports every 30 s)

export interface QuestBoard {
  day: string;
  quests: Array<{ id: QuestId; title: string; detail: string; icon: string; goal: number; progress: number; coins: number; done: boolean; claimed: boolean }>;
  bonus: { coins: number; claimed: boolean; ready: boolean };
  claimable: number;
}

export async function questBoard(userId: string): Promise<QuestBoard> {
  await ensureMigrated();
  const day = dayKey();
  const rows = await db.select().from(schema.questDays).where(and(eq(schema.questDays.userId, userId), eq(schema.questDays.day, day)));
  const byId = new Map(rows.map((r) => [r.quest, r]));
  const quests = (Object.keys(QUESTS) as QuestId[]).map((id) => {
    const q = QUESTS[id], r = byId.get(id);
    const progress = Math.min(q.goal, r?.progress ?? 0);
    return { id, title: q.title, detail: q.detail, icon: q.icon, goal: q.goal, progress, coins: q.coins, done: progress >= q.goal, claimed: !!r?.claimedAt };
  });
  const bonusRow = byId.get("bonus");
  const allClaimed = quests.every((q) => q.claimed);
  const bonus = { coins: BONUS_COINS, claimed: !!bonusRow?.claimedAt, ready: allClaimed && !bonusRow?.claimedAt };
  return { day, quests, bonus, claimable: quests.filter((q) => q.done && !q.claimed).length + (bonus.ready ? 1 : 0) };
}

export async function reportTheater(userId: string, seconds: number): Promise<number> {
  return bumpQuest(userId, "theater", Math.max(0, Math.min(THEATER_REPORT_CAP, Math.floor(seconds))), QUESTS.theater.goal);
}

/** Pays a finished quest once. The claim is a conditional update, so two tabs can't both collect. */
export async function claimQuest(userId: string, quest: QuestId | "bonus"): Promise<{ awarded: number; coins: number; board: QuestBoard }> {
  await ensureMigrated();
  const day = dayKey();
  let awarded = 0;
  if (quest === "bonus") {
    const board = await questBoard(userId);
    if (board.bonus.ready) {
      const won = await db.insert(schema.questDays).values({ userId, day, quest: "bonus", progress: 1, claimedAt: now(), updatedAt: now() }).onConflictDoNothing().returning({ quest: schema.questDays.quest });
      if (won.length) awarded = BONUS_COINS;
    }
  } else {
    const q = QUESTS[quest];
    const won = await db.update(schema.questDays).set({ claimedAt: now() })
      .where(and(eq(schema.questDays.userId, userId), eq(schema.questDays.day, day), eq(schema.questDays.quest, quest), isNull(schema.questDays.claimedAt), gte(schema.questDays.progress, q.goal)))
      .returning({ quest: schema.questDays.quest });
    if (won.length) awarded = q.coins;
  }
  const coins = awarded ? await addCoins(userId, awarded, "quest", `${day}:${quest}`) : (await db.select({ coins: schema.users.coins }).from(schema.users).where(eq(schema.users.id, userId)))[0]?.coins ?? 0;
  return { awarded, coins, board: await questBoard(userId) };
}
