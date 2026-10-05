import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrSetVisitor } from "@/lib/visitor";
import { updatePlayer, removePlayer } from "@/lib/presence";

export const dynamic = "force-dynamic";

const Body = z.object({
  leave: z.boolean().optional(),
  x: z.number().finite().optional(),
  z: z.number().finite().optional(),
  h: z.number().finite().optional(),
  s: z.number().int().min(0).max(2).optional(),
  n: z.string().max(40).optional(),
  a: z.object({ body: z.enum(["a", "b"]), skin: z.string().max(9), hair: z.string().max(10), hairColor: z.string().max(9), shirt: z.string().max(9), pants: z.string().max(9) }).optional(),
});

/** Where I am on the floor. The visitor cookie is the player id, so nobody can move somebody else. */
export async function POST(req: Request) {
  const res = NextResponse.json({ ok: true });
  const id = await getOrSetVisitor(res);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad body" }, { status: 400 });
  const b = parsed.data;
  if (b.leave || b.x === undefined || b.z === undefined) { removePlayer(id); return NextResponse.json({ ok: true, id }); }
  updatePlayer({ id, n: (b.n || "Visitor").slice(0, 40), a: b.a, x: b.x, z: b.z, h: b.h ?? 0, s: b.s ?? 0 });
  const out = NextResponse.json({ ok: true, id });
  for (const c of res.cookies.getAll()) out.cookies.set(c);
  return out;
}
