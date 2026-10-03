import { eq } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { newId, now } from "@/lib/util";
import { sendTakeoverNudge } from "@/lib/emails";

/** "Someone is eyeing your building": at most one notification + email per plot per day. */
export async function takeoverNudge(plotId: number, viewerId: string | null) {
  await ensureMigrated();
  const [p] = await db.select().from(schema.plots).where(eq(schema.plots.id, plotId));
  if (!p?.ownerId || p.ownerId === viewerId) return;
  if (p.lastTakeoverNudgeAt && now() - p.lastTakeoverNudgeAt < 86_400_000) return;
  await db.update(schema.plots).set({ lastTakeoverNudgeAt: now() }).where(eq(schema.plots.id, plotId));
  await db.insert(schema.notifications).values({
    id: newId(),
    userId: p.ownerId,
    type: "nudge",
    title: `Someone is looking at taking over ${p.name}`,
    body: "A visitor opened your takeover page. Boost to raise the price and your payout.",
    plotId,
    createdAt: now(),
  });
  await sendTakeoverNudge(p.ownerId, plotId, p.name ?? `Plot #${plotId}`, p.valueCents);
}
