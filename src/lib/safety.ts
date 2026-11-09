/**
 * Saved booths, blocks and reports: the small set of tools a visitor needs to make the hall theirs and to keep
 * someone unpleasant out of their day.
 *
 * - Favourites: a booth a signed-in visitor starred, listed under Search and walk-to-able. Guests keep theirs in the browser.
 * - Blocks: the blocker's chat hides the person, the person's direct messages and friend requests are refused. A guest
 *   has only a player id (the visitor cookie); an account has a user id as well, so a block records both when known.
 * - Reports: a note for the admins with the reason and the last things the person said, resolved from the admin pages.
 */
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { newId, now } from "@/lib/util";
import { notifyMany } from "@/lib/notify";

export const FAVORITES_LIMIT = 100;
import type { ReportReason } from "@/lib/report-reasons";
export { REPORT_REASONS, type ReportReason } from "@/lib/report-reasons";

/* ---------- favourites ---------- */
export async function favoritesOf(userId: string): Promise<number[]> {
  await ensureMigrated();
  const rows = await db.select({ boothId: schema.favorites.boothId }).from(schema.favorites).where(eq(schema.favorites.userId, userId)).orderBy(desc(schema.favorites.createdAt));
  return rows.map((r) => r.boothId);
}
export async function setFavorite(userId: string, boothId: number, on: boolean): Promise<number[]> {
  await ensureMigrated();
  if (on) {
    const have = await favoritesOf(userId);
    if (!have.includes(boothId)) {
      if (have.length >= FAVORITES_LIMIT) throw new Error(`You can save up to ${FAVORITES_LIMIT} booths. Remove one first.`);
      await db.insert(schema.favorites).values({ userId, boothId, createdAt: now() }).onConflictDoNothing();
    }
  } else await db.delete(schema.favorites).where(and(eq(schema.favorites.userId, userId), eq(schema.favorites.boothId, boothId)));
  return favoritesOf(userId);
}

/* ---------- blocks ---------- */
export interface BlockRow { id: string; userId: string | null; playerId: string | null; name: string; createdAt: number }
export interface Blocked { uids: string[]; pids: string[]; list: BlockRow[] }
export async function blocksOf(userId: string): Promise<Blocked> {
  await ensureMigrated();
  const rows = await db.select().from(schema.blocks).where(eq(schema.blocks.userId, userId)).orderBy(desc(schema.blocks.createdAt));
  const list = rows.map((r) => ({ id: r.id, userId: r.blockedUserId, playerId: r.blockedPlayerId, name: r.name, createdAt: r.createdAt }));
  return { uids: list.map((r) => r.userId).filter((x): x is string => !!x), pids: list.map((r) => r.playerId).filter((x): x is string => !!x), list };
}
/** Block (or unblock) someone, by user id when they have an account, by player id otherwise; both when both are known. */
export async function setBlock(userId: string, myPid: string | null, who: { uid?: string | null; pid?: string | null; name?: string }, on: boolean): Promise<Blocked> {
  await ensureMigrated();
  const uid = who.uid || null, pid = who.pid || null;
  if (!uid && !pid) throw new Error("Nobody to block");
  if (uid === userId) throw new Error("That's you");
  const match = or(uid ? eq(schema.blocks.blockedUserId, uid) : sql`0`, pid ? eq(schema.blocks.blockedPlayerId, pid) : sql`0`);
  const existing = await db.select({ id: schema.blocks.id }).from(schema.blocks).where(and(eq(schema.blocks.userId, userId), match));
  if (on) {
    if (existing.length === 0) await db.insert(schema.blocks).values({ id: newId(), userId, userPlayerId: myPid, blockedUserId: uid, blockedPlayerId: pid, name: (who.name ?? "").slice(0, 40), createdAt: now() });
    else if (uid) await db.update(schema.blocks).set({ blockedUserId: uid, ...(pid ? { blockedPlayerId: pid } : {}) }).where(inArray(schema.blocks.id, existing.map((e) => e.id))); // learn the account id of someone blocked as a guest
  } else if (existing.length) await db.delete(schema.blocks).where(inArray(schema.blocks.id, existing.map((e) => e.id)));
  return blocksOf(userId);
}
/** Has the target (known by account id and/or player id) blocked the sender (likewise)? Works while either is offline. */
export async function isBlockedBy(target: { uid?: string | null; pid?: string | null }, sender: { uid?: string | null; pid?: string | null }): Promise<boolean> {
  if ((!target.uid && !target.pid) || (!sender.uid && !sender.pid)) return false;
  await ensureMigrated();
  const who = or(target.uid ? eq(schema.blocks.userId, target.uid) : sql`0`, target.pid ? eq(schema.blocks.userPlayerId, target.pid) : sql`0`);
  const whom = or(sender.uid ? eq(schema.blocks.blockedUserId, sender.uid) : sql`0`, sender.pid ? eq(schema.blocks.blockedPlayerId, sender.pid) : sql`0`);
  const [row] = await db.select({ id: schema.blocks.id }).from(schema.blocks).where(and(who, whom)).limit(1);
  return !!row;
}

/* ---------- reports ---------- */
export async function addReport(reporterId: string, r: { uid?: string | null; pid?: string | null; name?: string; reason: ReportReason; details?: string; context?: string }): Promise<string> {
  await ensureMigrated();
  if (!r.uid && !r.pid) throw new Error("Nobody to report");
  const id = newId();
  await db.insert(schema.reports).values({ id, reporterId, targetUserId: r.uid || null, targetPlayerId: r.pid || null, targetName: (r.name ?? "").slice(0, 40), reason: r.reason, details: (r.details ?? "").slice(0, 600), context: (r.context ?? "").slice(0, 2000), status: "open", createdAt: now() });
  // the admins hear about it at once
  const admins = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.isAdmin, true));
  await notifyMany(admins.map((a) => a.id), "admin", `Report: ${r.reason}`, `${(r.name ?? "someone").slice(0, 40)} was reported for ${r.reason}. Review it under Admin → Users → Reports.`).catch(() => null);
  return id;
}
export async function listReports(status: "open" | "resolved" | "all" = "open") {
  await ensureMigrated();
  const where = status === "all" ? undefined : eq(schema.reports.status, status);
  const rows = await db.select().from(schema.reports).where(where).orderBy(desc(schema.reports.createdAt)).limit(200);
  const ids = Array.from(new Set(rows.flatMap((r) => [r.reporterId, r.targetUserId].filter((x): x is string => !!x))));
  const people = ids.length ? await db.select({ id: schema.users.id, email: schema.users.email, displayName: schema.users.displayName }).from(schema.users).where(inArray(schema.users.id, ids)) : [];
  const byId = new Map(people.map((p) => [p.id, p]));
  return rows.map((r) => ({ ...r, reporter: byId.get(r.reporterId) ?? null, target: r.targetUserId ? byId.get(r.targetUserId) ?? null : null }));
}
export async function resolveReport(id: string, adminId: string, reopen = false) {
  await ensureMigrated();
  await db.update(schema.reports).set(reopen ? { status: "open", resolvedAt: null, resolvedBy: null } : { status: "resolved", resolvedAt: now(), resolvedBy: adminId }).where(eq(schema.reports.id, id));
}
