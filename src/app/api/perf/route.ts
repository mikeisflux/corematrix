import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { getOrSetVisitor } from "@/lib/visitor";
import { appendPerf } from "@/lib/perf";

export const dynamic = "force-dynamic";
const Bucket = z.object({ t: z.number(), f: z.number(), avg: z.number(), p95: z.number(), max: z.number(), calls: z.number(), tris: z.number(), mode: z.enum(["w", "m"]), q: z.enum(["h", "m", "l"]), npc: z.number(), dpr: z.number(), long: z.number(), cpu: z.number().optional(), rend: z.number().optional() });
const Body = z.object({
  id: z.string().min(6).max(40),
  label: z.string().max(60).optional(),
  url: z.string().max(300).optional(),
  device: z.object({ gpu: z.string().max(300), vendor: z.string().max(120), ua: z.string().max(400), cores: z.number(), memory: z.number().nullable(), screen: z.string().max(20), viewport: z.string().max(20), dpr: z.number(), touch: z.boolean() }),
  samples: z.array(Bucket).max(120),
});

/** The hall posts 1-second frame buckets here; the visitor cookie ties them to one session row. */
export async function POST(req: Request) {
  const res = NextResponse.json({ ok: true });
  const visitorId = await getOrSetVisitor(res);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad body" }, { status: 400 });
  const u = await currentUser();
  try { await appendPerf({ ...parsed.data, visitorId, userId: u?.id ?? null }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 403 }); }
  const out = NextResponse.json({ ok: true });
  for (const c of res.cookies.getAll()) out.cookies.set(c);
  return out;
}
