"use client";
import type { AvatarConfig } from "@/lib/hall/store";

/** Other people on the floor right now, straight from /api/live. Mutable shared state read every frame; `version` bumps when the roster changes. */
export interface LivePlayer { id: string; n: string; a?: AvatarConfig; x: number; z: number; h: number; s: number; e?: { n: string; t: number } | null; r?: { k: string; t: number } | null; uid?: string | null; j?: string | null; w?: boolean }
export const live = {
  me: "",
  players: new Map<string, LivePlayer>(),
  total: 0, // everyone on the floor, near and far
  version: 0,
  ws: null as WebSocket | null, // the hall's socket when it is open (presence reports ride it; otherwise they POST)
};
/** A distant player, packed by the server: id, name, x, z, heading, state, away, account id, title. */
export type FarPlayer = [string, string, number, number, number, number, 0 | 1, string | null, string | null];
/**
 * One roster message: the people near me in full (only those that changed), everyone else packed every couple of
 * seconds, who left. A far player keeps whatever avatar we last saw in full; a newcomer far away has none until they
 * come close (they are drawn in the default look until then).
 */
/** A nearby player's movement, packed: id, x, z, heading, state, away, fresh emote, fresh reaction. */
export type MovePlayer = [string, number, number, number, number, 0 | 1, { n: string; t: number } | 0, { k: string; t: number } | 0];
export function applyRoster(m: { near?: LivePlayer[]; move?: MovePlayer[]; far?: FarPlayer[]; gone?: string[]; total: number; reset?: boolean }) {
  if (m.reset) live.players.clear();
  for (const p of m.near ?? []) live.players.set(p.id, p);
  for (const mv of m.move ?? []) {
    const [id, x, z, h, s, w, e, r] = mv; const prev = live.players.get(id);
    if (prev) { prev.x = x; prev.z = z; prev.h = h; prev.s = s; prev.w = !!w; prev.e = e || null; prev.r = r || null; }
    else live.players.set(id, { id, n: "Visitor", x, z, h, s, w: !!w, e: e || null, r: r || null });
  }
  for (const f of m.far ?? []) {
    const [id, n, x, z, h, s, w, uid, j] = f; const prev = live.players.get(id);
    live.players.set(id, { ...(prev ?? {}), id, n, x, z, h, s, w: !!w, uid, j, a: prev?.a });
  }
  for (const id of m.gone ?? []) live.players.delete(id);
  live.total = m.total;
  live.version++;
}
