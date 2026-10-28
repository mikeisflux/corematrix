import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { teamsOf, renameTeam, deleteTeam, setTeamBooths } from "@/lib/social-graph";

export const dynamic = "force-dynamic";

/** Rename a team and/or set which of my booths it staffs. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const { id } = await ctx.params;
  const b = z.object({ name: z.string().min(1).max(40).optional(), booths: z.array(z.number().int()).max(200).optional() }).safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "bad body" }, { status: 400 });
  try {
    if (b.data.name !== undefined) await renameTeam(u.id, id, b.data.name);
    if (b.data.booths) await setTeamBooths(u.id, id, b.data.booths);
    return NextResponse.json({ teams: await teamsOf(u.id) });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const { id } = await ctx.params;
  try { await deleteTeam(u.id, id); return NextResponse.json({ teams: await teamsOf(u.id) }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
