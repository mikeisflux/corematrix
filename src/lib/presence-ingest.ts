/**
 * One presence report, whichever way it arrived (the POST route or a WebSocket frame): validated, checked against
 * what the person may show (shop costumes, reaction packs, sitting at a claimed booth), then stored.
 */
import { z } from "zod";
import { VRM_URL_RE } from "@/lib/vrm-url";
import { ALL_REACTIONS, BASE_REACTIONS, costumeItem, reactionsFor } from "@/lib/hall/items";
import { ownedItemsCached } from "@/lib/shop";
import { COSTUME_IDS } from "@/lib/hall/costumes";
import { hallLayout } from "@/lib/hall/layout";
import { getBooth } from "@/lib/economy";
import { staffedBooths } from "@/lib/social-graph";
import { updatePlayer, removePlayer, hasPlayer, playerCount } from "@/lib/presence";
import { allow } from "@/lib/throttle";
import type { User } from "@/lib/auth";

const HEX = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const PresenceBody = z.object({
  leave: z.boolean().optional(),
  x: z.number().finite().optional(),
  z: z.number().finite().optional(),
  h: z.number().finite().optional(),
  s: z.number().int().min(0).max(3).optional(), // 0 idle, 1 walk, 2 run, 3 seated
  n: z.string().max(40).optional(),
  j: z.string().max(40).nullable().optional(), // job title under the name
  w: z.boolean().optional(), // away: the tab is in the background, keep my spot
  // everything here is rendered by every other client: only known values, so a crafted name can't break their view
  a: z.object({ body: z.enum(["a", "b"]), skin: HEX, hair: z.enum(["short", "long", "buzz", "bun", "curly", "bald"]), hairColor: HEX, shirt: HEX, pants: HEX, costume: z.enum(COSTUME_IDS as [string, ...string[]]).optional(), vrm: z.string().regex(VRM_URL_RE).optional().catch(undefined) }).optional(),
  e: z.object({ n: z.enum(["wave", "dance", "cheer", "clap", "bow", "point", "laugh", "facepalm"]), t: z.number().finite() }).nullable().optional().catch(null),
  r: z.object({ k: z.enum(ALL_REACTIONS as [string, ...string[]]), t: z.number().finite() }).nullable().optional().catch(null),
});
export type PresenceInput = z.infer<typeof PresenceBody>;

/** The hard ceiling on the floor; the queue (lib/queue.ts) decides who gets in under it. */
export const FLOOR_HARD_CAP = 600;

const sitCache = new Map<string, { ids: Set<number>; at: number }>();
async function maySitAt(x: number, z: number, userId: string | null, email: string): Promise<boolean> {
  const space = hallLayout().find((s) => Math.abs(s.x - x) <= s.w / 2 && Math.abs(s.z - z) <= s.d / 2);
  if (!space) return true; // benches and the rest of the floor are open to everyone
  const booth = await getBooth(space.id);
  if (!booth?.ownerId) return true;
  if (!userId) return false;
  let mine = sitCache.get(userId);
  if (!mine || Date.now() - mine.at > 60_000) {
    const staffed = await staffedBooths(userId, email).catch(() => []);
    mine = { ids: new Set(staffed.map((b) => b.id)), at: Date.now() };
    if (sitCache.size > 2000) sitCache.clear();
    sitCache.set(userId, mine);
  }
  return booth.ownerId === userId || mine.ids.has(space.id);
}

export type IngestResult = { ok: true; id: string } | { ok: false; status: number; error: string; code?: string };

/** Apply one report for player `id`. `ip` keys the new-player limit; `admit` says whether a newcomer may walk in (the queue). */
export async function ingestPresence(id: string, raw: unknown, ctx: { user: User | null; ip: string; admit?: () => Promise<{ ok: boolean; reason?: string }> }): Promise<IngestResult> {
  const parsed = PresenceBody.safeParse(raw);
  if (!parsed.success) return { ok: false, status: 400, error: "bad body" };
  const b = parsed.data;
  if (b.leave || b.x === undefined || b.z === undefined) { removePlayer(id); return { ok: true, id }; }
  if (!hasPlayer(id)) {
    // a script without cookies mints a fresh player per request: new players are limited per address and the floor is capped
    if (playerCount() >= FLOOR_HARD_CAP || !allow(`newplayer:${ctx.ip}`, 30, 60_000)) return { ok: false, status: 429, error: "The floor is full right now", code: "full" };
    if (ctx.admit) { const a = await ctx.admit(); if (!a.ok) return { ok: false, status: 429, error: a.reason ?? "The hall is full right now", code: "queue" }; }
  }
  const u = ctx.user;
  // shop costumes and reaction packs show only for players who own them (a minute-stale cache; guests own nothing)
  const costumeNeeds = costumeItem(b.a?.costume);
  const packReaction = b.r && !(BASE_REACTIONS as readonly string[]).includes(b.r.k);
  if (costumeNeeds || packReaction) {
    const owned = await ownedItemsCached(u?.id);
    if (costumeNeeds && !owned.has(costumeNeeds) && b.a) b.a = { ...b.a, costume: "none" };
    if (packReaction && b.r && !reactionsFor(owned).includes(b.r.k)) b.r = null;
  }
  // sitting inside a claimed booth is for its owner and crew; anyone else is shown standing there
  if (b.s === 3 && !(await maySitAt(b.x, b.z, u?.id ?? null, u?.email ?? ""))) b.s = 0;
  // an emote or reaction stamped in the future would stay "fresh" forever: clamp the time to now
  const t = Date.now(); const stamp = <T extends { t: number }>(v: T | null | undefined) => (v ? { ...v, t: Math.min(v.t, t) } : null);
  updatePlayer({ id, n: (b.n || "Visitor").slice(0, 40), a: b.a, x: b.x, z: b.z, h: b.h ?? 0, s: b.s ?? 0, e: stamp(b.e), r: stamp(b.r), uid: u?.id ?? null, j: u?.title ?? null, w: b.w === true });
  return { ok: true, id };
}
