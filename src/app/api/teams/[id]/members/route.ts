import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { teamsOf, addMember, removeMember } from "@/lib/social-graph";

export const dynamic = "force-dynamic";

/** Add a friend by user id, or anyone by email. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const { id } = await ctx.params;
  const b = z.object({ userId: z.string().max(40).optional(), email: z.string().max(200).optional() }).safeParse(await req.json().catch(() => null));
  if (!b.success || (!b.data.userId && !b.data.email)) return NextResponse.json({ error: "Who?" }, { status: 400 });
  try { await addMember(u.id, id, b.data); return NextResponse.json({ teams: await teamsOf(u.id) }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const { id } = await ctx.params;
  const member = new URL(req.url).searchParams.get("member") ?? "";
  try { await removeMember(u.id, id, member); return NextResponse.json({ teams: await teamsOf(u.id) }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
