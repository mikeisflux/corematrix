import { NextResponse } from "next/server";
import { z } from "zod";
import { COSTUME_IDS } from "@/lib/hall/costumes";
import { hallLayout } from "@/lib/hall/layout";
import { getBooth } from "@/lib/economy";
import { staffedBooths } from "@/lib/social-graph";
import { getOrSetPlayer } from "@/lib/visitor";
import { updatePlayer, removePlayer, hasPlayer, playerCount } from "@/lib/presence";
import { allow } from "@/lib/throttle";
import { clientIp } from "@/lib/auth";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const HEX = z.string().regex(/^#[0-9a-fA-F]{6}$/);

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
const Body = z.object({
  leave: z.boolean().optional(),
  x: z.number().finite().optional(),
  z: z.number().finite().optional(),
  h: z.number().finite().optional(),
  s: z.number().int().min(0).max(3).optional(), // 0 idle, 1 walk, 2 run, 3 seated
  n: z.string().max(40).optional(),
  j: z.string().max(40).nullable().optional(), // job title under the name
  w: z.boolean().optional(), // away: the tab is in the background, keep my spot
  // everything here is rendered by every other client: only known values, so a crafted name can't break their view
  a: z.object({ body: z.enum(["a", "b"]), skin: HEX, hair: z.enum(["short", "long", "buzz", "bun", "curly", "bald"]), hairColor: HEX, shirt: HEX, pants: HEX, costume: z.enum(COSTUME_IDS as [string, ...string[]]).optional() }).optional().catch(undefined), // a bad look is dropped, the player still shows
  e: z.object({ n: z.enum(["wave", "dance", "cheer", "clap", "bow", "point", "laugh", "facepalm"]), t: z.number().finite() }).nullable().optional().catch(null),
  r: z.object({ k: z.enum(["👋", "❤️", "😂", "🔥", "👏", "🎉", "😮", "👍"]), t: z.number().finite() }).nullable().optional().catch(null),
});

/** Where I am on the floor. The player id is derived from the private visitor cookie, so nobody can move somebody else. */
export async function POST(req: Request) {
  const res = NextResponse.json({ ok: true });
  const id = await getOrSetPlayer(res);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad body" }, { status: 400 });
  const b = parsed.data;
  if (b.leave || b.x === undefined || b.z === undefined) { removePlayer(id); return NextResponse.json({ ok: true, id }); }
  // a script without cookies mints a fresh player per request: new players are limited per address and the floor is capped
  if (!hasPlayer(id) && (playerCount() >= 600 || !allow(`newplayer:${await clientIp()}`, 30, 60_000))) return NextResponse.json({ error: "The floor is full right now" }, { status: 429 });
  const u = await currentUser().catch(() => null);
  // sitting inside a claimed booth is for its owner and crew; anyone else is shown standing there
  if (b.s === 3 && !(await maySitAt(b.x, b.z, u?.id ?? null, u?.email ?? ""))) b.s = 0;
  // an emote or reaction stamped in the future would stay "fresh" forever: clamp the time to now
  const t = Date.now(); const stamp = <T extends { t: number }>(v: T | null | undefined) => (v ? { ...v, t: Math.min(v.t, t) } : null);
  updatePlayer({ id, n: (b.n || "Visitor").slice(0, 40), a: b.a, x: b.x, z: b.z, h: b.h ?? 0, s: b.s ?? 0, e: stamp(b.e), r: stamp(b.r), uid: u?.id ?? null, j: u?.title ?? null, w: b.w === true });
  const out = NextResponse.json({ ok: true, id });
  for (const c of res.cookies.getAll()) out.cookies.set(c);
  return out;
}
