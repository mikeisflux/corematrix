import { NextResponse } from "next/server";
import { z } from "zod";
import { signInWithPassword, clientIp } from "@/lib/auth";

const Body = z.object({ email: z.string().max(200), password: z.string().max(200) });
/* Small in-memory throttle: 8 attempts per IP per 10 minutes. Enough to stop casual guessing on one box. */
const attempts = new Map<string, { n: number; until: number }>();

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const ip = await clientIp();
  const a = attempts.get(ip);
  if (a && a.until > Date.now() && a.n >= 8) return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
  const user = await signInWithPassword(parsed.data.email, parsed.data.password);
  if (!user) {
    attempts.set(ip, { n: (a && a.until > Date.now() ? a.n : 0) + 1, until: Date.now() + 10 * 60_000 });
    return NextResponse.json({ error: "Wrong email or password." }, { status: 401 });
  }
  attempts.delete(ip);
  return NextResponse.json({ ok: true });
}
