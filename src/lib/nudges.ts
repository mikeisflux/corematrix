import { and, eq, sql } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { now } from "@/lib/util";
import { sendTakeoverNudge } from "@/lib/emails";
import { notify } from "@/lib/notify";

/** "Someone is eyeing your booth": at most one notification + email per booth per day. */
export async function takeoverNudge(boothId: number, viewerId: string | null) {
  await ensureMigrated();
  const [p] = await db.select().from(schema.booths).where(eq(schema.booths.id, boothId));
  if (!p?.ownerId || p.ownerId === viewerId) return;
  // claim today's nudge in one statement: several viewers at once send one notice and one email, not one each
  const won = await db.update(schema.booths).set({ lastTakeoverNudgeAt: now() })
    .where(and(eq(schema.booths.id, boothId), sql`(${schema.booths.lastTakeoverNudgeAt} IS NULL OR ${schema.booths.lastTakeoverNudgeAt} < ${now() - 86_400_000})`)).returning({ id: schema.booths.id });
  if (!won.length) return;
  await notify(p.ownerId, "nudge", `Someone is looking at taking over ${p.name}`, "A visitor opened your takeover page. Boost to raise the price and your payout.", boothId);
  await sendTakeoverNudge(p.ownerId, boothId, p.name ?? `Booth #${boothId}`, p.valueCents);
}
