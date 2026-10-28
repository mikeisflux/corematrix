import { eq } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { now } from "@/lib/util";
import { sendTakeoverNudge } from "@/lib/emails";
import { notify } from "@/lib/notify";

/** "Someone is eyeing your booth": at most one notification + email per booth per day. */
export async function takeoverNudge(boothId: number, viewerId: string | null) {
  await ensureMigrated();
  const [p] = await db.select().from(schema.booths).where(eq(schema.booths.id, boothId));
  if (!p?.ownerId || p.ownerId === viewerId) return;
  if (p.lastTakeoverNudgeAt && now() - p.lastTakeoverNudgeAt < 86_400_000) return;
  await db.update(schema.booths).set({ lastTakeoverNudgeAt: now() }).where(eq(schema.booths.id, boothId));
  await notify(p.ownerId, "nudge", `Someone is looking at taking over ${p.name}`, "A visitor opened your takeover page. Boost to raise the price and your payout.", boothId);
  await sendTakeoverNudge(p.ownerId, boothId, p.name ?? `Booth #${boothId}`, p.valueCents);
}
