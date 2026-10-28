/**
 * Private messages between two people on the floor. Kept in memory on the one
 * server process (like the live roster): the last 100 per pair for a day.
 * Delivery goes only to the two visitor ids involved.
 */
import { publishTo } from "@/lib/realtime";
import { newId, now } from "@/lib/util";

export interface DmMessage { id: string; from: string; fromName: string; to: string; body: string; createdAt: number }
interface Thread { msgs: DmMessage[]; lastRead: Record<string, number> }
const g = globalThis as unknown as { __fccDm?: Map<string, Thread> };
const threads = (g.__fccDm ??= new Map<string, Thread>());
const KEEP = 100, TTL = 86_400_000;
const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function sweep() { const cut = now() - TTL; for (const [k, t] of threads) { t.msgs = t.msgs.filter((m) => m.createdAt > cut); if (!t.msgs.length) threads.delete(k); } }

export function sendDm(from: string, fromName: string, to: string, body: string): DmMessage {
  const msg: DmMessage = { id: newId(), from, fromName: fromName.slice(0, 40) || "Visitor", to, body: body.slice(0, 300), createdAt: now() };
  const k = key(from, to);
  const t = threads.get(k) ?? { msgs: [], lastRead: {} };
  t.msgs.push(msg); if (t.msgs.length > KEEP) t.msgs.splice(0, t.msgs.length - KEEP);
  t.lastRead[from] = msg.createdAt;
  threads.set(k, t);
  publishTo([from, to], { type: "dm", message: msg });
  if (threads.size % 50 === 0) sweep();
  return msg;
}
export function dmThread(me: string, other: string): DmMessage[] { return threads.get(key(me, other))?.msgs ?? []; }
export function markRead(me: string, other: string) { const t = threads.get(key(me, other)); if (t) t.lastRead[me] = now(); }
/** Everyone I have talked to, newest first, with how many of their messages I have not seen. */
export function dmThreads(me: string): { with: string; name: string; last: DmMessage; unread: number }[] {
  const out: { with: string; name: string; last: DmMessage; unread: number }[] = [];
  for (const [k, t] of threads) {
    const [a, b] = k.split("|"); if (a !== me && b !== me) continue;
    const other = a === me ? b : a;
    const last = t.msgs[t.msgs.length - 1]; if (!last) continue;
    const read = t.lastRead[me] ?? 0;
    const unread = t.msgs.filter((m) => m.from === other && m.createdAt > read).length;
    const theirName = [...t.msgs].reverse().find((m) => m.from === other)?.fromName ?? "Visitor";
    out.push({ with: other, name: theirName, last, unread });
  }
  return out.sort((x, y) => y.last.createdAt - x.last.createdAt);
}
