import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrSetPlayer } from "@/lib/visitor";
import { updatePlayer, removePlayer, hasPlayer, playerCount } from "@/lib/presence";
import { allow } from "@/lib/throttle";
import { clientIp } from "@/lib/auth";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const Body = z.object({
  leave: z.boolean().optional(),
  x: z.number().finite().optional(),
  z: z.number().finite().optional(),
  h: z.number().finite().optional(),
  s: z.number().int().min(0).max(3).optional(), // 0 idle, 1 walk, 2 run, 3 seated
  n: z.string().max(40).optional(),
  j: z.string().max(40).nullable().optional(), // job title under the name
  w: z.boolean().optional(), // away: the tab is in the background, keep my spot
  a: z.object({ body: z.enum(["a", "b"]), skin: z.string().max(9), hair: z.string().max(10), hairColor: z.string().max(9), shirt: z.string().max(9), pants: z.string().max(9), costume: z.string().max(12).optional() }).optional(),
  e: z.object({ n: z.string().max(16), t: z.number() }).nullable().optional(),
  r: z.object({ k: z.string().max(8), t: z.number() }).nullable().optional(),
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
  updatePlayer({ id, n: (b.n || "Visitor").slice(0, 40), a: b.a, x: b.x, z: b.z, h: b.h ?? 0, s: b.s ?? 0, e: b.e ?? null, r: b.r ?? null, uid: u?.id ?? null, j: u?.title ?? null, w: b.w === true });
  const out = NextResponse.json({ ok: true, id });
  for (const c of res.cookies.getAll()) out.cookies.set(c);
  return out;
}
