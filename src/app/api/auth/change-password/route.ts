import { NextResponse } from "next/server";
import { z } from "zod";
import { changePassword, currentUser } from "@/lib/auth";

export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const parsed = z.object({ current: z.string().max(200), next: z.string().max(200) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  try { await changePassword(u.id, parsed.data.current, parsed.data.next); return NextResponse.json({ ok: true }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
