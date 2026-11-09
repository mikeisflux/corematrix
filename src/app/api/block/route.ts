import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { blocksOf, setBlock } from "@/lib/safety";
import { getOrSetPlayer } from "@/lib/visitor";

export const dynamic = "force-dynamic";

/** Who this account has blocked: ids for the client's filters, and the list for the Blocked section in People. */
export async function GET() {
  const u = await currentUser();
  if (!u) return NextResponse.json({ uids: [], pids: [], list: [] });
  return NextResponse.json(await blocksOf(u.id));
}

/** Block or unblock a person, named by account id (uid) and/or player id (pid). */
export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in to block people" }, { status: 401 });
  const b = z.object({ uid: z.string().max(40).optional().nullable(), pid: z.string().max(60).optional().nullable(), name: z.string().max(40).optional(), on: z.boolean() }).safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "bad body" }, { status: 400 });
  try { return NextResponse.json(await setBlock(u.id, await getOrSetPlayer(), b.data, b.data.on)); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
