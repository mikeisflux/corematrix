import { NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { getOrSetPlayer, VID_COOKIE } from "@/lib/visitor";
import { hasPlayer, roster } from "@/lib/presence";
import { publishTo } from "@/lib/realtime";
import { allow } from "@/lib/throttle";
export const dynamic = "force-dynamic";

/** Two people can only start talking when the roster has them this close; the client's own range (14 ft) is tighter. */
const SIGNAL_RANGE_FT = 30;
const MAX_DATA_CHARS = 16_384; // an SDP offer is a few KB; anything bigger is not a handshake
const Body = z.object({ to: z.string().min(3).max(40), kind: z.enum(["offer", "answer", "ice", "bye"]), data: z.unknown().optional() });

/**
 * Relays one WebRTC handshake message (offer, answer, ICE candidate or bye) to one other person on the floor. The
 * audio itself goes browser to browser; the server only passes the introductions, and only between two people who are
 * both on the floor and standing near each other. 60 a minute per sender covers a handful of handshakes at once.
 */
export async function POST(req: Request) {
  const res = NextResponse.json({ ok: true });
  const me = await getOrSetPlayer(res);
  // a request without the visitor cookie would get a fresh identity (and a fresh rate limit) every time
  if (!(await cookies()).get(VID_COOKIE)) return NextResponse.json({ error: "Open the show floor first." }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad body" }, { status: 400 });
  const { to, kind, data } = parsed.data;
  if (to === me) return NextResponse.json({ error: "That's you" }, { status: 400 });
  if (data !== undefined && JSON.stringify(data).length > MAX_DATA_CHARS) return NextResponse.json({ error: "Signal too large" }, { status: 413 });
  if (!allow(`voice:${me}`, 60, 60_000)) return NextResponse.json({ error: "Slow down" }, { status: 429 });
  if (!hasPlayer(to)) return NextResponse.json({ error: "They're not on the floor right now." }, { status: 404 });
  const list = roster();
  const a = list.find((p) => p.id === me), b = list.find((p) => p.id === to);
  // a "bye" may follow someone who just walked off: let it through so the other side closes cleanly
  if (kind !== "bye" && (!a || !b || Math.hypot(a.x - b.x, a.z - b.z) > SIGNAL_RANGE_FT)) return NextResponse.json({ error: "They're too far away to talk to." }, { status: 409 });
  publishTo([to], { type: "voice", signal: { from: me, to, kind, data } });
  const out = NextResponse.json({ ok: true });
  for (const c of res.cookies.getAll()) out.cookies.set(c);
  return out;
}
