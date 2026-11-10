/**
 * Live players on the floor. Each walking client reports its position a few times a second; the server keeps the
 * latest and, five times a second, sends every open stream its own view of the roster: the people near it in full
 * (only those that moved or changed since the last tick), everyone else packed small every couple of seconds, and
 * who left. That keeps the traffic per person roughly constant however many are on the floor, instead of growing
 * with the square of the crowd.
 *
 * With REDIS_URL set the roster lives in a Redis hash as well, so several pm2 workers see the same floor: every
 * update is written through, and each worker refreshes its copy from Redis on every tick.
 */
import { listenersWithIds } from "@/lib/realtime";
import { redis, redisEnabled as busRedis } from "@/lib/redis";
import type { FarPlayer, MovePlayer, LiveMessage } from "@/lib/realtime";

export interface LivePlayer {
  id: string;
  n: string; // display name
  a: unknown; // avatar config
  x: number;
  z: number;
  h: number; // heading, radians
  s: number; // 0 idle, 1 walk, 2 run, 3 seated
  e?: { n: string; t: number } | null; // last emote (name, when)
  r?: { k: string; t: number } | null; // last reaction (emoji, when)
  uid?: string | null; // signed-in account, so people can befriend each other on the floor
  j?: string | null; // job title shown under the name
  w?: boolean; // away: the tab is hidden; a slow heartbeat keeps the spot for a while
  t: number; // last update, ms
  sig?: string; // the look: name, avatar, account, title; a listener gets the full record again only when this changes
}

const g = globalThis as unknown as { __fccPlayers?: Map<string, LivePlayer>; __fccPlayersTimer?: NodeJS.Timeout | null; __fccPresenceSync?: number };
const players = (g.__fccPlayers ??= new Map<string, LivePlayer>());
const STALE_MS = 6000;
const AWAY_STALE_MS = 150_000; // background tabs may only get a timer once a minute
const TICK_MS = 200; // near players
const FAR_MS = 2000; // the packed far list
export const NEAR_FT = 160; // the fast tick reaches this far; figures beyond it move on the two-second list (they are drawn small or not at all)
const MAX_NEAR = 60; // and never more than this many people at the fast rate, nearest first, however dense the spot
const HASH = "fcc:players";

export function updatePlayer(p: Omit<LivePlayer, "t" | "sig">) {
  const row: LivePlayer = { ...p, t: Date.now(), sig: `${p.n}|${p.uid ?? ""}|${p.j ?? ""}|${JSON.stringify(p.a ?? null)}` };
  players.set(p.id, row);
  redis()?.hset(HASH, p.id, JSON.stringify(row)).catch(() => {});
  startTicker();
}
export const hasPlayer = (id: string) => players.has(id);
export const playerCount = () => players.size;
export function removePlayer(id: string) {
  players.delete(id);
  redis()?.hdel(HASH, id).catch(() => {});
}
/** The visitor ids (tabs) a signed-in person is on the floor with right now. */
export function visitorsOf(userId: string): string[] {
  return roster().filter((p) => p.uid === userId).map((p) => p.id);
}
const fresh = (p: LivePlayer, now: number) => p.t >= (p.w ? now - AWAY_STALE_MS : now - STALE_MS);
export function roster(): LivePlayer[] {
  const now = Date.now();
  for (const [id, p] of players) if (!fresh(p, now)) { players.delete(id); redis()?.hdel(HASH, id).catch(() => {}); }
  return Array.from(players.values());
}
/** In a cluster, take the other workers' updates from Redis before building anyone's view. */
async function syncFromRedis() {
  const r = redis(); if (!r) return;
  try {
    const all = await r.hgetall(HASH);
    const now = Date.now(); const seen = new Set<string>();
    for (const [id, raw] of Object.entries(all)) {
      let p: LivePlayer; try { p = JSON.parse(raw); } catch { continue; }
      seen.add(id);
      const mine = players.get(id);
      if (!mine || p.t >= mine.t) players.set(id, p);
      if (!fresh(p, now)) { players.delete(id); r.hdel(HASH, id).catch(() => {}); }
    }
    for (const id of Array.from(players.keys())) if (!seen.has(id) && !(players.get(id)!.t > now - 1000)) players.delete(id); // gone elsewhere (a fresh local write may not have landed yet)
  } catch { /* redis hiccup: the local copy stands */ }
}

/** Per-listener bookkeeping: what this stream has been told about (last update time and look per person), and when it last got the far list. */
type View = { known: Map<string, { t: number; sig: string }>; lastFar: number; init: boolean };
const views = new WeakMap<(m: LiveMessage) => void, View>();
const r1 = (n: number) => Math.round(n * 10) / 10, r2 = (n: number) => Math.round(n * 100) / 100;
const packFar = (p: LivePlayer): FarPlayer => [p.id, p.n, r1(p.x), r1(p.z), r2(p.h), p.s, p.w ? 1 : 0, p.uid ?? null, p.j ?? null];
const packMove = (p: LivePlayer, now: number): MovePlayer => [p.id, r1(p.x), r1(p.z), r2(p.h), p.s, p.w ? 1 : 0, p.e && now - p.e.t < 6000 ? p.e : 0, p.r && now - p.r.t < 4000 ? p.r : 0];
const full = (p: LivePlayer): Omit<LivePlayer, "t" | "sig"> => { const { t: _t, sig: _s, ...rest } = p; void _t; void _s; return rest; };
function tick() {
  const list = roster();
  const byId = new Map(list.map((p) => [p.id, p]));
  const now = Date.now();
  for (const [send, vid] of listenersWithIds()) {
    let v = views.get(send); if (!v) { v = { known: new Map(), lastFar: 0, init: false }; views.set(send, v); }
    const me = byId.get(vid);
    const farDue = now - v.lastFar >= FAR_MS;
    // the fast set: the nearest MAX_NEAR people within NEAR_FT of me (a map viewer has no "me": everyone is far)
    let fast: LivePlayer[] = [];
    if (me) {
      const withD = list.map((p) => [p, Math.hypot(p.x - me.x, p.z - me.z)] as const).filter(([, d]) => d < NEAR_FT);
      if (withD.length > MAX_NEAR) withD.sort((a, b) => a[1] - b[1]);
      fast = withD.slice(0, MAX_NEAR).map(([p]) => p);
    }
    const fastIds = new Set(fast.map((p) => p.id));
    const near: Omit<LivePlayer, "t" | "sig">[] = []; const move: MovePlayer[] = []; const far: FarPlayer[] = [];
    for (const p of fast) {
      const k = v.known.get(p.id);
      if (!k || k.sig !== p.sig) { near.push(full(p)); v.known.set(p.id, { t: p.t, sig: p.sig! }); }
      else if (k.t !== p.t) { move.push(packMove(p, now)); k.t = p.t; }
    }
    for (const p of list) {
      if (fastIds.has(p.id)) continue;
      const k = v.known.get(p.id);
      if (farDue || !k) { far.push(packFar(p)); v.known.set(p.id, { t: p.t, sig: k?.sig ?? "" }); }
    }
    const gone: string[] = [];
    for (const id of v.known.keys()) if (!byId.has(id)) { gone.push(id); v.known.delete(id); }
    if (farDue) v.lastFar = now;
    if (!v.init || near.length || move.length || far.length || gone.length) {
      send({ type: "players", near: near.length ? near : undefined, move: move.length ? move : undefined, far: far.length ? far : undefined, gone: gone.length ? gone : undefined, total: list.length, reset: !v.init || undefined });
      v.init = true;
    }
  }
}
function startTicker() {
  if (g.__fccPlayersTimer) return;
  let busy = false;
  g.__fccPlayersTimer = setInterval(() => {
    if (busy) return; busy = true;
    const run = () => { try { tick(); } finally { busy = false; } if (players.size === 0 && !busRedis()) { clearInterval(g.__fccPlayersTimer!); g.__fccPlayersTimer = null; } };
    if (busRedis()) void syncFromRedis().then(run, run); else run();
  }, TICK_MS);
}
/** Streams opened on a worker where nobody has walked yet still need their roster view. */
export function ensurePresenceTicker() { startTicker(); }
