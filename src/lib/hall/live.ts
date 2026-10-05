"use client";
import type { AvatarConfig } from "@/lib/hall/store";

/** Other people on the floor right now, straight from /api/live. Mutable shared state read every frame; `version` bumps when the roster changes. */
export interface LivePlayer { id: string; n: string; a?: AvatarConfig; x: number; z: number; h: number; s: number }
export const live = {
  me: "",
  players: new Map<string, LivePlayer>(),
  version: 0,
};
export function applyRoster(list: LivePlayer[]) {
  const ids = new Set(list.map((p) => p.id));
  let changed = false;
  for (const id of Array.from(live.players.keys())) if (!ids.has(id)) { live.players.delete(id); changed = true; }
  for (const p of list) { if (!live.players.has(p.id)) changed = true; live.players.set(p.id, p); }
  if (changed) live.version++;
}
