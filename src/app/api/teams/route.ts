import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { teamsOf, createTeam } from "@/lib/social-graph";

export const dynamic = "force-dynamic";

export async function GET() {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  return NextResponse.json({ teams: await teamsOf(u.id) });
}

export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const b = z.object({ name: z.string().min(1).max(40) }).safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "Give the team a name" }, { status: 400 });
  try { return NextResponse.json({ id: await createTeam(u.id, b.data.name), teams: await teamsOf(u.id) }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
