import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { claimSponsor, ownedItems } from "@/lib/shop";
import { allow } from "@/lib/throttle";

const Body = z.object({ sponsorId: z.string().max(40) });

export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in to claim it" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  if (!allow(`claim:${u.id}`, 20, 60_000)) return NextResponse.json({ error: "Slow down" }, { status: 429 });
  try {
    const r = await claimSponsor(u.id, parsed.data.sponsorId);
    return NextResponse.json({ ...r, owned: Array.from(await ownedItems(u.id)) });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
