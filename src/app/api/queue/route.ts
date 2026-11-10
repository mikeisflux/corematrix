import { NextResponse } from "next/server";
import { getOrSetPlayer } from "@/lib/visitor";
import { queueStatusFor } from "@/lib/queue";

export const dynamic = "force-dynamic";

/** Where I stand in the line for the floor (the waiting room asks every few seconds; the WebSocket answers the same question in-band). */
export async function GET() {
  const res = NextResponse.json({ ok: true }); // collects the visitor cookie for a first-time caller
  const id = await getOrSetPlayer(res);
  const out = NextResponse.json(await queueStatusFor(id));
  for (const c of res.cookies.getAll()) out.cookies.set(c);
  return out;
}
