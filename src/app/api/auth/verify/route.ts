import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyEmail } from "@/lib/auth";

/** Use an emailed confirm link. POST only: mail scanners open links with GET, and must not use it up. */
export async function POST(req: Request) {
  const parsed = z.object({ token: z.string().min(10).max(80) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "That link is incomplete. Send yourself a new one from your dashboard." }, { status: 400 });
  const u = await verifyEmail(parsed.data.token);
  if (!u) return NextResponse.json({ error: "That link expired or was already used. Send yourself a new one from your dashboard." }, { status: 400 });
  return NextResponse.json({ ok: true, email: u.email });
}
