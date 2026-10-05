import { NextResponse } from "next/server";
import { z } from "zod";
import { requestPasswordReset } from "@/lib/auth";

export async function POST(req: Request) {
  const parsed = z.object({ email: z.string().max(200) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  try { await requestPasswordReset(parsed.data.email); return NextResponse.json({ ok: true }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
