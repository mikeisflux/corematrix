import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { friendsOf, requestFriend, answerRequest, unfriend } from "@/lib/social-graph";
import { allow } from "@/lib/throttle";

export const dynamic = "force-dynamic";

/** My friends, requests waiting on me, requests I sent. */
export async function GET() {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  return NextResponse.json(await friendsOf(u.id));
}

/** Send a request to a signed-in person (their user id comes with the live roster). */
export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in to add friends" }, { status: 401 });
  const b = z.object({ to: z.string().min(1).max(40) }).safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "bad body" }, { status: 400 });
  // a declined request can be sent again, so cap how often anyone can ask: no request-spam loops
  if (!allow(`friend:${u.id}`, 20, 3600_000) || !allow(`friend:${u.id}:${b.data.to}`, 3, 86_400_000)) return NextResponse.json({ error: "That's a lot of friend requests. Try again later." }, { status: 429 });
  try { return NextResponse.json({ status: await requestFriend(u.id, b.data.to) }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}

/** Accept or decline a request sent to me. */
export async function PATCH(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const b = z.object({ id: z.string().min(1).max(40), accept: z.boolean() }).safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "bad body" }, { status: 400 });
  try { await answerRequest(u.id, b.data.id, b.data.accept); return NextResponse.json({ ok: true }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}

/** Unfriend, or withdraw a request I sent. */
export async function DELETE(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const other = new URL(req.url).searchParams.get("id") ?? "";
  if (!other) return NextResponse.json({ error: "bad request" }, { status: 400 });
  await unfriend(u.id, other);
  return NextResponse.json({ ok: true });
}
