import { NextResponse } from "next/server";
import { getOrSetPlayer } from "@/lib/visitor";
import { clientIp, currentUser } from "@/lib/auth";
import { ingestPresence } from "@/lib/presence-ingest";
import { admitOrQueue } from "@/lib/queue";

export const dynamic = "force-dynamic";

/** Where I am on the floor (the fallback for browsers without the WebSocket). The player id is derived from the private visitor cookie, so nobody can move somebody else. */
export async function POST(req: Request) {
  const res = NextResponse.json({ ok: true });
  const id = await getOrSetPlayer(res);
  const user = await currentUser().catch(() => null);
  // a first report mints the visitor cookie (set on the reply below); the per-address limit on new players covers cookieless scripts
  const r = await ingestPresence(id, await req.json().catch(() => null), { user, ip: await clientIp(), admit: () => admitOrQueue(id, user) });
  if (!r.ok) return NextResponse.json({ error: r.error, code: r.code }, { status: r.status });
  const out = NextResponse.json({ ok: true, id });
  for (const c of res.cookies.getAll()) out.cookies.set(c);
  return out;
}
