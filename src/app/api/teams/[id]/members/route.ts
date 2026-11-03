import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { teamsOf, addMember, removeMember, leaveTeam, acceptInvite, setMemberRole } from "@/lib/social-graph";

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
  // ?accept=1: say yes to an invite
  if (new URL(req.url).searchParams.get("accept") === "1") {
    try { await acceptInvite(u.id, id); return NextResponse.json({ ok: true }); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
  }
  // ?leave=1: take myself off someone else's team (or decline an invite)
  if (new URL(req.url).searchParams.get("leave") === "1") {
    try { await leaveTeam(u.id, id); return NextResponse.json({ ok: true }); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
  }
  try { await removeMember(u.id, id, member); return NextResponse.json({ teams: await teamsOf(u.id) }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}

/** Make a member a manager (edits the booths the team staffs) or a plain member again. Owner only. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const { id } = await ctx.params;
  const b = z.object({ member: z.string().max(40), role: z.enum(["member", "manager"]) }).safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  try { await setMemberRole(u.id, id, b.data.member, b.data.role); return NextResponse.json({ teams: await teamsOf(u.id) }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
