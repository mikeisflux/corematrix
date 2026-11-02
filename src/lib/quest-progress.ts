/**
 * Quest progress bumps, kept apart from lib/quests.ts so the things that bump (the arcade, the tracker) can import
 * this without a cycle: quests.ts pays coins through lib/arcade.ts.
 */
import { sql } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { dayKey, now } from "@/lib/util";

export type QuestId = "visit" | "theater" | "arcade";

/** Adds to today's progress for a quest, capped at `max` (the goal, or the most a single report may add). */
export async function bumpQuest(userId: string, quest: QuestId, by: number, max: number): Promise<number> {
  await ensureMigrated();
  const [row] = await db.insert(schema.questDays)
    .values({ userId, day: dayKey(), quest, progress: Math.min(by, max), updatedAt: now() })
    .onConflictDoUpdate({ target: [schema.questDays.userId, schema.questDays.day, schema.questDays.quest], set: { progress: sql`min(${max}, ${schema.questDays.progress} + ${by})`, updatedAt: now() } })
    .returning({ progress: schema.questDays.progress });
  return row?.progress ?? 0;
}
