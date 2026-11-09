import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { favoritesOf, setFavorite } from "@/lib/safety";
import { boothSpace } from "@/lib/hall/layout";

export const dynamic = "force-dynamic";

/** The booths this account saved (★). Guests keep theirs in the browser; see lib/hall/store. */
export async function GET() {
  const u = await currentUser();
  if (!u) return NextResponse.json({ favorites: [] });
  return NextResponse.json({ favorites: await favoritesOf(u.id) });
}

export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in to save booths across devices" }, { status: 401 });
  const b = z.object({ boothId: z.number().int().positive(), on: z.boolean() }).safeParse(await req.json().catch(() => null));
  if (!b.success || !boothSpace(b.data.boothId)) return NextResponse.json({ error: "No such booth" }, { status: 400 });
  try { return NextResponse.json({ favorites: await setFavorite(u.id, b.data.boothId, b.data.on) }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
