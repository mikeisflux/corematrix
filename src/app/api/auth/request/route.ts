import { NextResponse } from "next/server";
import { z } from "zod";
import { requestMagicLink } from "@/lib/auth";

const Body = z.object({ email: z.string().max(200), next: z.string().max(300).optional(), ref: z.string().max(20).optional() });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  try {
    const r = await requestMagicLink(parsed.data.email, parsed.data.next, parsed.data.ref);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
