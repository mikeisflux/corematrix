/**
 * The hall-full safeguard. The floor takes HALL_CAPACITY walkers (Admin → Settings, default 400); past that, a
 * newcomer who tries to walk joins a first-come line and sees the waiting room instead. As walkers leave, the head
 * of the line gets a ticket good for 90 seconds and walks in. The map, booths, chat and the theater stay open to
 * everyone while they wait; admins never queue. In memory on one worker, in Redis across pm2 workers.
 */
import { getSetting } from "@/lib/settings";
import { playerCount } from "@/lib/presence";
import { redis } from "@/lib/redis";
import type { User } from "@/lib/auth";
import type { LiveMessage } from "@/lib/realtime";

export const DEFAULT_CAPACITY = 400;
const TICKET_MS = 90_000; // admitted: walk in within this long or go to the back
const SEEN_MS = 20_000; // a waiting tab checks every few seconds; one silent this long has left
const AVG_STAY_S = 480; // for the estimate: a walk lasts about eight minutes

export async function hallCapacity(): Promise<number> {
  const v = Number(await getSetting("HALL_CAPACITY"));
  return Number.isFinite(v) && v >= 10 ? Math.floor(v) : DEFAULT_CAPACITY;
}

// in-memory line: id → joined, last seen; tickets: id → expiry
const g = globalThis as unknown as { __fccQueue?: Map<string, { joined: number; seen: number }>; __fccTickets?: Map<string, number> };
const line = (g.__fccQueue ??= new Map());
const tickets = (g.__fccTickets ??= new Map());

type Snapshot = { order: string[]; tickets: number; mine: { pos: number; ticket: boolean } };
/** The line as it stands (pruned), with this visitor's place in it. Position 0 = not in line. */
async function snapshot(id: string): Promise<Snapshot> {
  const now = Date.now();
  const r = redis();
  if (r) {
    try {
      await r.zremrangebyscore("fcc:qseen", "-inf", String(now - SEEN_MS)); // who stopped checking
      const alive = new Set(await r.zrange("fcc:qseen", "0", "-1"));
      const all = await r.zrange("fcc:queue", "0", "-1");
      const dead = all.filter((x) => !alive.has(x)); if (dead.length) await r.zrem("fcc:queue", ...dead);
      const order = all.filter((x) => alive.has(x));
      const th = await r.hgetall("fcc:tickets");
      let live = 0; const expired: string[] = [];
      for (const [k, v] of Object.entries(th)) { if (Number(v) > now) live++; else expired.push(k); }
      if (expired.length) await r.hdel("fcc:tickets", ...expired);
      return { order, tickets: live, mine: { pos: order.indexOf(id) + 1, ticket: Number(th[id] ?? 0) > now } };
    } catch { /* fall through to memory */ }
  }
  for (const [k, v] of line) if (now - v.seen > SEEN_MS) line.delete(k);
  for (const [k, v] of tickets) if (v <= now) tickets.delete(k);
  const order = Array.from(line.entries()).sort((a, b) => a[1].joined - b[1].joined).map(([k]) => k);
  return { order, tickets: tickets.size, mine: { pos: order.indexOf(id) + 1, ticket: tickets.has(id) } };
}
async function join(id: string) {
  const now = Date.now(); const r = redis();
  if (r) { try { await r.zadd("fcc:queue", "NX", now, id); await r.zadd("fcc:qseen", now, id); return; } catch { /* memory */ } }
  const cur = line.get(id); line.set(id, { joined: cur?.joined ?? now, seen: now });
}
async function leave(id: string) {
  const r = redis();
  if (r) { try { await r.zrem("fcc:queue", id); await r.zrem("fcc:qseen", id); await r.hdel("fcc:tickets", id); return; } catch { /* memory */ } }
  line.delete(id); tickets.delete(id);
}
async function grant(id: string) {
  const exp = Date.now() + TICKET_MS; const r = redis();
  if (r) { try { await r.hset("fcc:tickets", id, String(exp)); await r.zrem("fcc:queue", id); return; } catch { /* memory */ } }
  tickets.set(id, exp); line.delete(id);
}
/** Hand tickets to the head of the line while the floor has room (counting tickets already out as taken). */
async function promote(capacity: number, snap: Snapshot) {
  let free = capacity - playerCount() - snap.tickets;
  for (const id of snap.order) { if (free <= 0) break; await grant(id); free--; }
}

/** Called for a newcomer's first report: in, or in line. */
export async function admitOrQueue(id: string, user: User | null): Promise<{ ok: boolean; reason?: string }> {
  if (user?.isAdmin) return { ok: true };
  const capacity = await hallCapacity();
  const snap = await snapshot(id);
  if (snap.mine.ticket) { await leave(id); return { ok: true }; }
  if (playerCount() + snap.tickets < capacity && (snap.order.length === 0 || snap.order[0] === id)) { await leave(id); return { ok: true }; }
  await join(id);
  await promote(capacity, await snapshot(id));
  const again = await snapshot(id);
  if (again.mine.ticket) { await leave(id); return { ok: true }; }
  return { ok: false, reason: "The hall is full right now. You are in line." };
}

/** Where this visitor stands; also keeps their place alive and hands out tickets as room appears. */
export async function queueStatusFor(id: string): Promise<Extract<LiveMessage, { type: "queue" }>> {
  const capacity = await hallCapacity();
  const r = redis(); const now = Date.now();
  if (r) { try { await r.zadd("fcc:qseen", "XX", now, id); } catch { /* memory */ } } else { const cur = line.get(id); if (cur) cur.seen = now; }
  let snap = await snapshot(id);
  await promote(capacity, snap);
  snap = await snapshot(id);
  const ahead = snap.mine.pos > 0 ? snap.mine.pos - 1 : 0;
  const walkers = Math.max(1, playerCount());
  const etaSec = snap.mine.ticket ? 0 : Math.min(1800, Math.max(30, Math.round(((ahead + 1) * AVG_STAY_S) / walkers)));
  return { type: "queue", position: snap.mine.pos, ahead, etaSec, capacity, admitted: snap.mine.ticket || undefined };
}
