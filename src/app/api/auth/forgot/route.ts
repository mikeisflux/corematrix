import { NextResponse } from "next/server";
import { z } from "zod";
import { requestPasswordReset, clientIp } from "@/lib/auth";
import { allow } from "@/lib/throttle";

export async function POST(req: Request) {
  const parsed = z.object({ email: z.string().max(200) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  // limited per address and per inbox (no mail-bombing), and the email goes out in the background so the response
  // takes the same time whether or not the account exists
  const ip = await clientIp(), email = parsed.data.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
  if (!allow(`forgot:ip:${ip}`, 5, 10 * 60_000) || !allow(`forgot:to:${email}`, 3, 3600_000)) return NextResponse.json({ ok: true });
  try { void requestPasswordReset(parsed.data.email).catch((e) => console.error("[forgot]", e)); return NextResponse.json({ ok: true }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
