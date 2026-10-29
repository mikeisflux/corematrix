import { NextResponse } from "next/server";
import { z } from "zod";
import { signInWithPassword, clientIp } from "@/lib/auth";
import { allow } from "@/lib/throttle";

const Body = z.object({ email: z.string().max(200), password: z.string().max(200) });

/* Each attempt is counted before the password is checked, so a burst of parallel guesses is limited too:
   10 per address per 10 minutes, and 20 per account per 15 minutes from anywhere. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const ip = await clientIp();
  const email = parsed.data.email.trim().toLowerCase();
  if (!allow(`login:ip:${ip}`, 10, 10 * 60_000) || !allow(`login:acct:${email}`, 20, 15 * 60_000)) return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
  const user = await signInWithPassword(parsed.data.email, parsed.data.password);
  if (!user) return NextResponse.json({ error: "Wrong email or password." }, { status: 401 });
  return NextResponse.json({ ok: true });
}
