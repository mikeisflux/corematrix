import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrSetPlayer } from "@/lib/visitor";
import { dmThread, dmThreads, markRead, sendDm } from "@/lib/dm";
import { roster } from "@/lib/presence";
import { currentUser } from "@/lib/auth";
import { allow } from "@/lib/throttle";
export const dynamic = "force-dynamic";

const Body = z.object({ to: z.string().min(3).max(40), body: z.string().trim().min(1).max(300), name: z.string().max(40).optional() });

/** GET ?with=<id> → that thread (and marks it read); GET alone → my threads with unread counts. */
export async function GET(req: Request) {
  const me = await getOrSetPlayer();
  const other = new URL(req.url).searchParams.get("with");
  if (other) { await markRead(me, other); return NextResponse.json({ me, messages: await dmThread(me, other) }); }
  return NextResponse.json({ me, threads: await dmThreads(me) });
}
/** Send a private message to another visitor id. 20 per minute. */
export async function POST(req: Request) {
  const res = NextResponse.json({ ok: true });
  const me = await getOrSetPlayer(res);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Say something (up to 300 characters)" }, { status: 400 });
  if (parsed.data.to === me) return NextResponse.json({ error: "That's you" }, { status: 400 });
  if (!allow(`dm:${me}`, 20, 60_000)) return NextResponse.json({ error: "Slow down: 20 messages a minute" }, { status: 429 });
  const u = await currentUser();
  const onFloor = roster().find((p) => p.id === me);
  const name = u?.displayName || onFloor?.n || parsed.data.name || "Visitor";
  const msg = await sendDm(me, name, parsed.data.to, parsed.data.body);
  const out = NextResponse.json({ ok: true, message: msg });
  for (const c of res.cookies.getAll()) out.cookies.set(c);
  return out;
}
