import { NextResponse } from "next/server";
import { z } from "zod";
import { resetPassword } from "@/lib/auth";

export async function POST(req: Request) {
  const parsed = z.object({ token: z.string().max(80), password: z.string().max(200) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  try {
    const u = await resetPassword(parsed.data.token, parsed.data.password);
    if (!u) return NextResponse.json({ error: "That reset link expired or was already used. Request a new one." }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
