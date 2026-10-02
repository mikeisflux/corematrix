import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { GAMES, startPlay, type GameId } from "@/lib/arcade";

export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in to play. New players get free coins." }, { status: 401 });
  const parsed = z.object({ gameId: z.enum(Object.keys(GAMES) as [GameId, ...GameId[]]) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Unknown game" }, { status: 400 });
  try {
    return NextResponse.json(await startPlay(u.id, parsed.data.gameId));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
