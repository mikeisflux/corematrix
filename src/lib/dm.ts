/**
 * Private messages between two people on the floor, keyed by visitor id and
 * stored in the database so a deploy or restart never loses a conversation.
 * Delivery goes live only to the two visitor ids involved; the last 100 per
 * pair are kept for 30 days.
 */
import { and, desc, eq, or, sql } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { publishTo } from "@/lib/realtime";
import { newId, now } from "@/lib/util";
import { publicId } from "@/lib/visitor";

/** Threads were once keyed by the private cookie id; move any still stored that way onto the public id, once per process. */
let rekeyed: Promise<void> | null = null;
function rekey() {
  return (rekeyed ??= (async () => {
    await ensureMigrated();
    const rows = await db.select({ f: schema.dms.fromId, t: schema.dms.toId }).from(schema.dms).where(sql`substr(${schema.dms.fromId}, 1, 2) = 'v_' OR substr(${schema.dms.toId}, 1, 2) = 'v_'`);
    const ids = new Set<string>();
    for (const r of rows) { if (r.f.startsWith("v_")) ids.add(r.f); if (r.t.startsWith("v_")) ids.add(r.t); }
    for (const id of ids) {
      const p = await publicId(id);
      await db.update(schema.dms).set({ fromId: p }).where(eq(schema.dms.fromId, id));
      await db.update(schema.dms).set({ toId: p }).where(eq(schema.dms.toId, id));
    }
  })().catch((e) => { rekeyed = null; throw e; }));
}

export interface DmMessage { id: string; from: string; fromName: string; to: string; body: string; createdAt: number }
const KEEP = 100, TTL = 30 * 86_400_000;
const row = (r: typeof schema.dms.$inferSelect): DmMessage => ({ id: r.id, from: r.fromId, fromName: r.fromName, to: r.toId, body: r.body, createdAt: r.createdAt });
const between = (a: string, b: string) => or(and(eq(schema.dms.fromId, a), eq(schema.dms.toId, b)), and(eq(schema.dms.fromId, b), eq(schema.dms.toId, a)));

export async function sendDm(from: string, fromName: string, to: string, body: string): Promise<DmMessage> {
  await rekey();
  const msg: DmMessage = { id: newId(), from, fromName: fromName.slice(0, 40) || "Visitor", to, body: body.slice(0, 300), createdAt: now() };
  await db.insert(schema.dms).values({ id: msg.id, fromId: from, fromName: msg.fromName, toId: to, body: msg.body, createdAt: msg.createdAt });
  publishTo([from, to], { type: "dm", message: msg });
  // keep the pair's thread at KEEP messages and drop anything older than TTL across the table, cheaply
  if (Math.random() < 0.05) await db.delete(schema.dms).where(sql`${schema.dms.createdAt} < ${now() - TTL}`);
  // SQLite needs a LIMIT before an OFFSET
  const extra = await db.select({ id: schema.dms.id }).from(schema.dms).where(between(from, to)).orderBy(desc(schema.dms.createdAt)).limit(1000).offset(KEEP);
  if (extra.length) await db.delete(schema.dms).where(sql`${schema.dms.id} IN (${sql.join(extra.map((e) => sql`${e.id}`), sql`, `)})`);
  return msg;
}
export async function dmThread(me: string, other: string): Promise<DmMessage[]> {
  await rekey();
  const rows = await db.select().from(schema.dms).where(between(me, other)).orderBy(desc(schema.dms.createdAt)).limit(KEEP);
  return rows.reverse().map(row);
}
export async function hasThread(me: string, other: string): Promise<boolean> {
  await rekey();
  const [r] = await db.select({ id: schema.dms.id }).from(schema.dms).where(between(me, other)).limit(1);
  return !!r;
}
export async function markRead(me: string, other: string) {
  await rekey();
  await db.update(schema.dms).set({ readAt: now() }).where(and(eq(schema.dms.toId, me), eq(schema.dms.fromId, other), sql`${schema.dms.readAt} IS NULL`));
}
/** Everyone I have talked to, newest first, with how many of their messages I have not seen. */
export async function dmThreads(me: string): Promise<{ with: string; name: string; last: DmMessage; unread: number }[]> {
  await rekey();
  const rows = await db.select().from(schema.dms).where(or(eq(schema.dms.fromId, me), eq(schema.dms.toId, me))).orderBy(desc(schema.dms.createdAt)).limit(2000);
  const out = new Map<string, { with: string; name: string; last: DmMessage; unread: number }>();
  for (const r of rows) {
    const other = r.fromId === me ? r.toId : r.fromId;
    let t = out.get(other);
    if (!t) { t = { with: other, name: "Visitor", last: row(r), unread: 0 }; out.set(other, t); }
    if (r.fromId === other) { if (t.name === "Visitor") t.name = r.fromName; if (!r.readAt) t.unread++; }
  }
  return Array.from(out.values()).sort((x, y) => y.last.createdAt - x.last.createdAt);
}
