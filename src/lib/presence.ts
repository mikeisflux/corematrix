/**
 * Live players on the floor. Everyone walking the hall shares one session:
 * each client reports its position a few times a second, the server keeps the
 * latest in memory and streams the whole roster to every open /api/live
 * connection five times a second. Single-instance (pm2 runs one); move the
 * map to Redis to scale out.
 */
import { publish } from "@/lib/realtime";

export interface LivePlayer {
  id: string;
  n: string; // display name
  a: unknown; // avatar config
  x: number;
  z: number;
  h: number; // heading, radians
  s: number; // 0 idle, 1 walk, 2 run
  t: number; // last update, ms
}

const g = globalThis as unknown as { __fccPlayers?: Map<string, LivePlayer>; __fccPlayersTimer?: NodeJS.Timeout | null };
const players = (g.__fccPlayers ??= new Map<string, LivePlayer>());
const STALE_MS = 6000;
const TICK_MS = 200;

export function updatePlayer(p: Omit<LivePlayer, "t">) {
  players.set(p.id, { ...p, t: Date.now() });
  startTicker();
}
export function removePlayer(id: string) {
  if (players.delete(id)) publish({ type: "players", players: roster() });
}
export function roster(): LivePlayer[] {
  const cutoff = Date.now() - STALE_MS;
  for (const [id, p] of players) if (p.t < cutoff) players.delete(id);
  return Array.from(players.values());
}
function startTicker() {
  if (g.__fccPlayersTimer) return;
  g.__fccPlayersTimer = setInterval(() => {
    const list = roster();
    publish({ type: "players", players: list });
    if (list.length === 0) { clearInterval(g.__fccPlayersTimer!); g.__fccPlayersTimer = null; }
  }, TICK_MS);
}
