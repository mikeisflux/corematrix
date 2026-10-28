/**
 * In-app notifications: one row in `notifications` (shown under Account in the
 * hall, badge on the rail button) plus live delivery as a toast to every tab
 * that person has open. Every event that concerns a person goes through here.
 */
import { db, ensureMigrated, schema } from "@/lib/db";
import { newId, now } from "@/lib/util";
import { publishTo } from "@/lib/realtime";
import { visitorsOf } from "@/lib/presence";

export type NoticeType = "friend" | "team" | "sold" | "claim" | "takeover" | "boost" | "plan" | "renewal" | "payout" | "prize" | "arcade" | "coins" | "credit" | "referral" | "season" | "nudge" | "mention" | "welcome" | "booth" | "admin";

export async function notify(userId: string | null | undefined, type: NoticeType, title: string, body?: string | null, boothId?: number | null) {
  if (!userId) return;
  await ensureMigrated();
  const n = { id: newId(), userId, type, title: title.slice(0, 160), body: body ? body.slice(0, 500) : null, boothId: boothId ?? null, createdAt: now() };
  await db.insert(schema.notifications).values(n);
  try { publishTo(visitorsOf(userId), { type: "notice", notice: { id: n.id, type, title: n.title, body: n.body, boothId: n.boothId, createdAt: n.createdAt } }); } catch { /* live delivery is best effort */ }
}
export async function notifyMany(userIds: Array<string | null | undefined>, type: NoticeType, title: string, body?: string | null, boothId?: number | null) {
  for (const id of Array.from(new Set(userIds.filter((x): x is string => !!x)))) await notify(id, type, title, body, boothId);
}
