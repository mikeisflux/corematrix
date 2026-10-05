import { NextResponse } from "next/server";
import { z } from "zod";
import { register } from "@/lib/auth";

const Body = z.object({ email: z.string().max(200), password: z.string().max(200), displayName: z.string().max(60).optional(), ref: z.string().max(20).optional() });
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  try {
    const u = await register(parsed.data.email, parsed.data.password, parsed.data.displayName, parsed.data.ref);
    return NextResponse.json({ ok: true, id: u.id });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
